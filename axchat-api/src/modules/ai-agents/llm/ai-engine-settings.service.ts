import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';

/** Os três motores que a IA AxChat usa. */
export type EngineKind = 'text' | 'vision' | 'audio';

export interface EngineSlot {
  baseUrl: string | null;
  apiKey: string | null;
  modelId: string | null;
}

export type AiEngineConfig = Record<EngineKind, EngineSlot>;

/** De onde cada campo veio, pro Super Admin saber o que está mandando. */
export type EngineFieldSource = 'ui' | 'env' | 'default';

export const ENGINE_KINDS: EngineKind[] = ['text', 'vision', 'audio'];

const AI_ENGINE_KEY = 'ai_engine';
/** Config global muda raramente; 30s evita ler o banco a cada completion. */
const CACHE_TTL_MS = 30_000;

/**
 * Configuração GLOBAL do motor da "IA AxChat" — a que roda para toda org com
 * `axchatAiEnabled = true`. Fica em `PlatformSetting['ai_engine']` e é editada
 * pelo Super Admin.
 *
 * Precedência por campo: o que o Super Admin salvou na UI > variável de env >
 * default do código. Assim quem já roda por env continua funcionando sem tocar
 * em nada, e a UI passa a ser o jeito de sobrescrever.
 *
 * NÃO tem nada a ver com o motor do cliente (`axchatAiEnabled = false`), que
 * vem de `Organization.deepseekApiKey` e dos `AiModelProvider` da org.
 */
@Injectable()
export class AiEngineSettingsService {
  private readonly logger = new Logger(AiEngineSettingsService.name);
  private cache: { value: AiEngineConfig; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Defaults de env/código, usados quando a UI não definiu o campo. */
  private envConfig(): AiEngineConfig {
    return {
      text: {
        baseUrl:
          this.config.get<string>('DEEPSEEK_BASE_URL') ||
          'https://api.deepseek.com',
        apiKey: this.config.get<string>('DEEPSEEK_API_KEY') || null,
        modelId: this.config.get<string>('AI_DEFAULT_MODEL_ID') || 'deepseek-chat',
      },
      vision: {
        // null = deixa o SDK da Anthropic usar o endpoint padrão dele.
        baseUrl: null,
        apiKey: this.config.get<string>('ANTHROPIC_API_KEY') || null,
        modelId:
          this.config.get<string>('AI_VISION_FALLBACK_MODEL_ID') ||
          'claude-haiku-4-5',
      },
      audio: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: this.config.get<string>('OPENAI_API_KEY') || null,
        modelId: 'whisper-1',
      },
    };
  }

  private async readOverrides(): Promise<Partial<Record<EngineKind, Partial<EngineSlot>>>> {
    try {
      const row = await this.prisma.platformSetting.findUnique({
        where: { key: AI_ENGINE_KEY },
      });
      if (!row?.value || typeof row.value !== 'object') return {};
      return row.value as Partial<Record<EngineKind, Partial<EngineSlot>>>;
    } catch (err) {
      // Banco fora / migration não rodada não pode derrubar a IA: cai pro env.
      this.logger.warn(
        `Falha ao ler config do motor de IA — usando env: ${(err as Error).message}`,
      );
      return {};
    }
  }

  /** Config efetiva (UI > env > default). É o que o runtime deve usar. */
  async getEffective(): Promise<AiEngineConfig> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) {
      return this.cache.value;
    }

    const env = this.envConfig();
    const overrides = await this.readOverrides();

    const merged = ENGINE_KINDS.reduce((acc, kind) => {
      const o = overrides[kind] ?? {};
      acc[kind] = {
        baseUrl: this.pick(o.baseUrl, env[kind].baseUrl),
        apiKey: this.pick(o.apiKey, env[kind].apiKey),
        modelId: this.pick(o.modelId, env[kind].modelId),
      };
      return acc;
    }, {} as AiEngineConfig);

    this.cache = { value: merged, at: now };
    return merged;
  }

  /** String vazia conta como "não definido" — cai pro fallback. */
  private pick(override: string | null | undefined, fallback: string | null) {
    const v = typeof override === 'string' ? override.trim() : null;
    return v ? v : fallback;
  }

  /**
   * Visão para o Super Admin: nunca devolve a chave em texto puro, e diz de
   * onde cada valor está vindo (UI ou env) pra não haver dúvida sobre o que
   * está em uso.
   */
  async getForAdmin() {
    const env = this.envConfig();
    // Uma leitura só: valor e origem TÊM que sair do mesmo snapshot. Usar o
    // `getEffective()` cacheado aqui já causou a tela mostrar um valor antigo
    // com a origem nova (informação contraditória pro admin).
    const overrides = await this.readOverrides();

    return ENGINE_KINDS.reduce(
      (acc, kind) => {
        const o = overrides[kind] ?? {};
        const baseUrl = this.pick(o.baseUrl, env[kind].baseUrl);
        const modelId = this.pick(o.modelId, env[kind].modelId);
        const apiKey = this.pick(o.apiKey, env[kind].apiKey);
        const uiKey = typeof o.apiKey === 'string' && o.apiKey.trim() ? o.apiKey.trim() : null;

        acc[kind] = {
          baseUrl,
          modelId,
          apiKeySet: !!apiKey,
          apiKeyPreview: apiKey ? `${'•'.repeat(8)}${apiKey.slice(-4)}` : null,
          source: {
            baseUrl: this.sourceOf(o.baseUrl, env[kind].baseUrl),
            modelId: this.sourceOf(o.modelId, env[kind].modelId),
            apiKey: uiKey ? 'ui' : env[kind].apiKey ? 'env' : 'default',
          },
        };
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  private sourceOf(
    override: string | null | undefined,
    envValue: string | null,
  ): EngineFieldSource {
    if (typeof override === 'string' && override.trim()) return 'ui';
    return envValue ? 'env' : 'default';
  }

  /**
   * Salva overrides. Campo ausente = não mexe; string vazia ou null = APAGA o
   * override (volta pro env). Devolve a visão mascarada já atualizada.
   */
  async save(patch: Partial<Record<EngineKind, Partial<EngineSlot>>>) {
    const current = await this.readOverrides();
    const next: Record<string, Partial<EngineSlot>> = { ...current };

    for (const kind of ENGINE_KINDS) {
      const incoming = patch[kind];
      if (!incoming) continue;
      const slot: Partial<EngineSlot> = { ...(next[kind] ?? {}) };

      for (const field of ['baseUrl', 'apiKey', 'modelId'] as const) {
        if (!(field in incoming)) continue;
        const raw = incoming[field];
        const value = typeof raw === 'string' ? raw.trim() : null;
        if (value) slot[field] = value;
        else delete slot[field];
      }
      next[kind] = slot;
    }

    await this.prisma.platformSetting.upsert({
      where: { key: AI_ENGINE_KEY },
      create: { key: AI_ENGINE_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });

    this.invalidate();
    return this.getForAdmin();
  }

  /** Derruba o cache — chamado ao salvar. Outras instâncias pegam via TTL. */
  invalidate() {
    this.cache = null;
  }

  /**
   * Bate no provider de verdade com a config EFETIVA e devolve o resultado.
   * É o que prova que a chave/base-URL salva realmente funciona — sem isso o
   * Super Admin só descobriria o erro quando um cliente ficasse sem resposta.
   */
  async testConnection(
    kind: EngineKind,
  ): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const slot = (await this.getEffective())[kind];
    const start = Date.now();

    if (!slot.apiKey) {
      return {
        success: false,
        message: 'Nenhuma chave configurada para este motor.',
        latencyMs: 0,
      };
    }

    try {
      if (kind === 'vision') {
        const client = new Anthropic({
          apiKey: slot.apiKey,
          timeout: 30_000,
          maxRetries: 0,
        });
        const res = await client.messages.create({
          model: slot.modelId ?? 'claude-haiku-4-5',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Responda apenas: ok' }],
        });
        const text = res.content
          .map((c) => (c.type === 'text' ? c.text : ''))
          .join('')
          .trim();
        return {
          success: true,
          message: `Conexão OK — modelo ${slot.modelId} respondeu "${text.slice(0, 20)}"`,
          latencyMs: Date.now() - start,
        };
      }

      const client = new OpenAI({
        apiKey: slot.apiKey,
        ...(slot.baseUrl ? { baseURL: slot.baseUrl } : {}),
        timeout: 30_000,
        maxRetries: 0,
      });

      if (kind === 'audio') {
        // Não dá pra transcrever sem um arquivo: validamos credencial e
        // endpoint listando os modelos, que é o mesmo par chave/base-URL.
        const models = await client.models.list();
        const count = models.data?.length ?? 0;
        return {
          success: true,
          message: `Conexão OK — credencial válida (${count} modelos disponíveis).`,
          latencyMs: Date.now() - start,
        };
      }

      const res = await client.chat.completions.create({
        model: slot.modelId ?? 'deepseek-chat',
        messages: [{ role: 'user', content: 'Responda apenas: ok' }],
        max_tokens: 10,
        temperature: 0,
      });
      const text = res.choices?.[0]?.message?.content?.trim() ?? '';
      return {
        success: true,
        message: `Conexão OK — modelo ${slot.modelId} respondeu "${text.slice(0, 20)}"`,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      const detail =
        err?.error?.message ||
        err?.response?.data?.error?.message ||
        err?.message ||
        'erro desconhecido';
      this.logger.warn(`Teste do motor "${kind}" falhou: ${detail}`);
      return {
        success: false,
        message: `Falha: ${detail}`,
        latencyMs: Date.now() - start,
      };
    }
  }
}
