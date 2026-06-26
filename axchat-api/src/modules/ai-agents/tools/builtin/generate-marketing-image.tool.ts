import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';
import { MarketingStorageService } from '../marketing-storage.service';

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);

/**
 * Gera um criativo (gpt-image-1) E hospeda a imagem no storage do app,
 * devolvendo SÓ a URL pública — nunca expõe o base64 ao LLM (evita estourar
 * o contexto) e entrega uma URL pronta pro Instagram/Caspian publicar.
 *
 * Lê OPENAI_API_KEY do OrganizationSecret da org (cai pro env do servidor).
 * A copy/legenda NÃO sai daqui — o próprio LLM (Orla) escreve.
 */
@Injectable()
export class GenerateMarketingImageTool implements AiTool {
  private readonly logger = new Logger(GenerateMarketingImageTool.name);

  readonly name = 'generateMarketingImage';
  readonly description =
    'Gera uma imagem de marketing (gpt-image-1) a partir de um prompt visual detalhado e a hospeda, retornando uma URL pública pronta pra publicar. A copy/legenda você escreve separadamente.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['prompt'],
    properties: {
      prompt: {
        type: 'string',
        description:
          'Descrição visual detalhada do criativo (cena, estilo, paleta, mood, enquadramento). Quanto mais específico, melhor.',
        minLength: 4,
      },
      size: {
        type: 'string',
        enum: ['1024x1024', '1024x1536', '1536x1024'],
        description: 'Dimensão: quadrado (1024x1024), retrato (1024x1536) ou paisagem (1536x1024).',
        default: '1024x1024',
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: MarketingStorageService,
  ) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const prompt = String(input.prompt ?? '').trim();
    if (!prompt) {
      return { output: { ok: false, error: 'prompt vazio' } };
    }
    const size = ALLOWED_SIZES.has(String(input.size))
      ? String(input.size)
      : '1024x1024';

    const apiKey = await this.resolveOpenAiKey(ctx.organizationId);
    if (!apiKey) {
      await this.logFailure(ctx, 'openai_key_missing');
      return {
        output: {
          ok: false,
          error: 'openai_key_missing',
          message:
            'OPENAI_API_KEY não configurada. Peça pra adicionar a credencial em Configurações → Integrações.',
        },
      };
    }

    try {
      const res = await fetch(OPENAI_IMAGES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size, n: 1 }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`OpenAI images falhou (${res.status}): ${text.slice(0, 300)}`);
        await this.logFailure(ctx, `openai_error:${res.status}`);
        return {
          output: {
            ok: false,
            error: 'openai_error',
            status: res.status,
            message: text.slice(0, 300),
          },
        };
      }

      const json = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) {
        await this.logFailure(ctx, 'empty_openai_response');
        return { output: { ok: false, error: 'sem imagem no retorno da OpenAI' } };
      }

      const buffer = Buffer.from(b64, 'base64');
      const stored = await this.store(buffer, ctx.organizationId);
      const url = stored.url;

      // Persiste a mídia no banco (URL + key/bucket salvos) + log de atividade.
      const asset = await this.prisma.marketingMediaAsset
        .create({
          data: {
            organizationId: ctx.organizationId,
            kind: 'IMAGE',
            url,
            storageKey: stored.key,
            bucket: stored.bucket,
            mimeType: 'image/png',
            bytes: buffer.length,
            source: 'openai-gpt-image-1',
            prompt,
            agentId: ctx.agentId,
            runId: ctx.runId,
          },
          select: { id: true },
        })
        .catch((e) => {
          this.logger.warn(`falha ao registrar MediaAsset: ${e?.message ?? e}`);
          return null;
        });
      if (asset) {
        await this.prisma.marketingActivity
          .create({
            data: {
              organizationId: ctx.organizationId,
              agentId: ctx.agentId,
              runId: ctx.runId,
              action: 'IMAGE_GENERATED',
              status: 'OK',
              title: 'Criativo gerado',
              payload: { assetId: asset.id, url },
            },
          })
          .catch(() => undefined);
      }

      this.logger.log(`generateMarketingImage: hospedada em ${url} (agent=${ctx.agentId})`);
      return { output: { ok: true, url, size, assetId: asset?.id ?? null } };
    } catch (err: any) {
      this.logger.error(`generateMarketingImage erro: ${err?.message ?? err}`);
      await this.logFailure(ctx, String(err?.message ?? err));
      return { output: { ok: false, error: String(err?.message ?? err) } };
    }
  }

  /** Log de atividade pra geração de imagem que FALHOU (custo/tentativa fica auditável). */
  private async logFailure(ctx: ToolContext, reason: string): Promise<void> {
    await this.prisma.marketingActivity
      .create({
        data: {
          organizationId: ctx.organizationId,
          agentId: ctx.agentId,
          runId: ctx.runId,
          action: 'IMAGE_GENERATED',
          status: 'FAILED',
          title: 'Falha ao gerar criativo',
          payload: { reason: reason.slice(0, 500) },
        },
      })
      .catch(() => undefined);
  }

  private async resolveOpenAiKey(organizationId: string): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findFirst({
      where: { organizationId, key: 'OPENAI_API_KEY' },
      select: { value: true },
    });
    if (secret?.value) return secret.value;
    return this.config.get<string>('OPENAI_API_KEY') ?? null;
  }

  /**
   * Hospeda o PNG: MinIO (pasta do tenant) quando configurado, senão storage
   * local. A pasta do tenant é o slug do nome da org — criada no 1º upload e
   * reaproveitada nos próximos (o prefixo da key É a pasta no S3/MinIO).
   */
  private async store(
    buffer: Buffer,
    organizationId: string,
  ): Promise<{ url: string; key: string | null; bucket: string | null }> {
    if (this.storage.isConfigured()) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      const prefix = this.storage.tenantPrefix(org?.name ?? '', organizationId);
      const filename = `${randomBytes(12).toString('hex')}.png`;
      const key = `${prefix}/${filename}`;
      const obj = await this.storage.upload({
        buffer,
        key,
        contentType: 'image/png',
      });
      return { url: obj.url, key: obj.key, bucket: obj.bucket };
    }
    // Fallback local.
    const url = await this.hostPng(buffer);
    return { url, key: null, bucket: null };
  }

  /** Salva o PNG no mesmo uploads dir servido em /api/v1/uploads e devolve URL absoluta. */
  private async hostPng(buffer: Buffer): Promise<string> {
    const uploadsDir =
      this.config.get<string>('UPLOADS_DIR') || path.join(process.cwd(), 'uploads');
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dir = path.join(uploadsDir, 'media', day);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${randomBytes(12).toString('hex')}.png`;
    await fs.writeFile(path.join(dir, filename), buffer);

    const relativeUrl = `/api/v1/uploads/media/${day}/${filename}`;
    const apiUrl =
      this.config.get<string>('PUBLIC_API_URL') ||
      this.config.get<string>('API_URL') ||
      'http://localhost:3001/api/v1';
    const host = apiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return `${host}${relativeUrl}`;
  }
}
