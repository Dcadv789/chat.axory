import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

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
        return { output: { ok: false, error: 'sem imagem no retorno da OpenAI' } };
      }

      const url = await this.hostPng(Buffer.from(b64, 'base64'));
      this.logger.log(`generateMarketingImage: hospedada em ${url} (agent=${ctx.agentId})`);
      return { output: { ok: true, url, size } };
    } catch (err: any) {
      this.logger.error(`generateMarketingImage erro: ${err?.message ?? err}`);
      return { output: { ok: false, error: String(err?.message ?? err) } };
    }
  }

  private async resolveOpenAiKey(organizationId: string): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findFirst({
      where: { organizationId, key: 'OPENAI_API_KEY' },
      select: { value: true },
    });
    if (secret?.value) return secret.value;
    return this.config.get<string>('OPENAI_API_KEY') ?? null;
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
