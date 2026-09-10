import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../database/prisma.service';

export const EVOLUTION_SETTING_KEY = 'evolution_api';

/** Servidor Evolution da plataforma. Um só, compartilhado por todos os tenants. */
export interface EvolutionConfig {
  baseUrl: string | null;
  apiKey: string | null;
}

const CACHE_TTL_MS = 30_000;

/**
 * Onde mora o endereço do servidor Evolution.
 *
 * Fica em `PlatformSetting` e não em variável de ambiente porque trocar de
 * servidor é operação de dono de plataforma, não de deploy: o Super Admin
 * troca na tela e o efeito é imediato. O env continua valendo como partida
 * (primeira subida, ambiente local), mas a tela ganha dele.
 *
 * A chave nunca sai daqui em texto puro pra tela — só `apiKeySet` e os quatro
 * últimos dígitos, igual ao motor de IA.
 */
@Injectable()
export class EvolutionSettingsService {
  private readonly logger = new Logger(EvolutionSettingsService.name);
  private cache: { value: EvolutionConfig; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private envConfig(): EvolutionConfig {
    return {
      baseUrl: this.config.get<string>('EVOLUTION_API_URL') || null,
      apiKey: this.config.get<string>('EVOLUTION_API_KEY') || null,
    };
  }

  private async readOverrides(): Promise<Partial<EvolutionConfig>> {
    try {
      const row = await this.prisma.platformSetting.findUnique({
        where: { key: EVOLUTION_SETTING_KEY },
      });
      if (!row?.value || typeof row.value !== 'object') return {};
      return row.value as Partial<EvolutionConfig>;
    } catch (err) {
      // Banco fora não pode derrubar o envio de mensagem: cai pro env.
      this.logger.warn(
        `Falha ao ler config da Evolution — usando env: ${(err as Error).message}`,
      );
      return {};
    }
  }

  /** String vazia conta como "não definido" — cai pro fallback. */
  private pick(override: string | null | undefined, fallback: string | null) {
    const v = typeof override === 'string' ? override.trim() : null;
    return v ? v : fallback;
  }

  /**
   * Config efetiva (tela > env). É o que o cliente HTTP deve usar.
   *
   * A barra final do baseUrl sai aqui: `https://evo.axory.com/` + `/instance/create`
   * vira uma URL com barra dupla, que alguns proxies respondem 404 — erro chato
   * de achar porque a config "parece" certa na tela.
   */
  async getEffective(): Promise<EvolutionConfig> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.value;

    const env = this.envConfig();
    const o = await this.readOverrides();
    const merged: EvolutionConfig = {
      baseUrl: this.pick(o.baseUrl, env.baseUrl)?.replace(/\/+$/, '') ?? null,
      apiKey: this.pick(o.apiKey, env.apiKey),
    };

    this.cache = { value: merged, at: now };
    return merged;
  }

  /** Já configurado o bastante pra ofertar o canal ao cliente? */
  async isConfigured(): Promise<boolean> {
    const c = await this.getEffective();
    return !!c.baseUrl && !!c.apiKey;
  }

  /** Visão do Super Admin: diz de onde veio cada valor, sem revelar a chave. */
  async getForAdmin() {
    const env = this.envConfig();
    // Uma leitura só: valor e origem têm que sair do mesmo snapshot.
    const o = await this.readOverrides();
    const baseUrl = this.pick(o.baseUrl, env.baseUrl);
    const apiKey = this.pick(o.apiKey, env.apiKey);

    return {
      baseUrl,
      apiKeySet: !!apiKey,
      apiKeyPreview: apiKey ? `${'•'.repeat(8)}${apiKey.slice(-4)}` : null,
      configured: !!baseUrl && !!apiKey,
      source: {
        baseUrl: this.sourceOf(o.baseUrl, env.baseUrl),
        apiKey: this.sourceOf(o.apiKey, env.apiKey),
      },
    };
  }

  private sourceOf(override: string | null | undefined, envValue: string | null) {
    if (typeof override === 'string' && override.trim()) return 'ui' as const;
    return envValue ? ('env' as const) : ('default' as const);
  }

  /**
   * Campo ausente = não mexe; string vazia = APAGA o override e volta pro env.
   * Sem isso não haveria como desfazer uma configuração errada pela tela.
   */
  async save(patch: Partial<EvolutionConfig>) {
    const next: Record<string, string> = {
      ...((await this.readOverrides()) as Record<string, string>),
    };

    for (const field of ['baseUrl', 'apiKey'] as const) {
      if (!(field in patch)) continue;
      const raw = patch[field];
      const value = typeof raw === 'string' ? raw.trim() : null;
      if (value) next[field] = field === 'baseUrl' ? value.replace(/\/+$/, '') : value;
      else delete next[field];
    }

    await this.prisma.platformSetting.upsert({
      where: { key: EVOLUTION_SETTING_KEY },
      create: {
        key: EVOLUTION_SETTING_KEY,
        value: next as Prisma.InputJsonValue,
      },
      update: { value: next as Prisma.InputJsonValue },
    });

    this.invalidate();
    return this.getForAdmin();
  }

  /** Derruba o cache — chamado ao salvar. Outras instâncias pegam via TTL. */
  invalidate() {
    this.cache = null;
  }
}
