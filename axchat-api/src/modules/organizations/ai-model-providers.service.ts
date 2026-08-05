import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAiModelProviderDto, UpdateAiModelProviderDto } from './dto/create-ai-model-provider.dto';
import {
  AI_MODEL_CATALOG,
  findCatalogProvider,
  isLegacyProvider,
  resolveBaseUrl,
  resolveTransport,
} from './ai-model-catalog';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AiModelProvidersService {
  private readonly logger = new Logger(AiModelProvidersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * A chave NUNCA volta pro navegador — só um preview mascarado, igual ao que
   * já fazemos com a chave da org e com o motor global. Antes o `findMany`
   * devolvia a linha inteira e a tela chegava a preencher o input com a chave
   * em texto puro.
   */
  async list(orgId: string) {
    const rows = await this.prisma.aiModelProvider.findMany({
      where: { organizationId: orgId },
      orderBy: [{ provider: 'asc' }, { name: 'asc' }],
    });
    return rows.map(({ apiKey, ...rest }) => ({
      ...rest,
      apiKeySet: !!apiKey,
      apiKeyPreview: apiKey ? `${'•'.repeat(8)}${apiKey.slice(-4)}` : null,
    }));
  }

  /** Catálogo de motores/modelos que a tela "Adicionar IA" oferece. */
  catalog() {
    return { providers: AI_MODEL_CATALOG };
  }

  /**
   * Recusa combinações que não teriam como funcionar em runtime — é o que o
   * formulário livre antigo deixava passar (ex.: "Anthropic" sem base-URL, que
   * mandava a chave `sk-ant-` pra api.openai.com).
   */
  private assertUsable(
    provider: string,
    baseUrl?: string | null,
    mode: 'create' | 'update' = 'create',
  ) {
    const catalog = findCatalogProvider(provider);
    if (!catalog) {
      // Motor que saiu da lista: registro antigo continua editável (a base-URL
      // legada ainda resolve), mas NÃO se cria um novo assim — senão a remoção
      // do catálogo não significa nada.
      if (mode === 'update' && isLegacyProvider(provider)) return;
      throw new BadRequestException(
        `Motor "${provider}" desconhecido. Escolha um da lista ou use "Personalizado".`,
      );
    }
    if (catalog.requiresManualSetup && !baseUrl?.trim()) {
      throw new BadRequestException(
        'Para um motor personalizado é obrigatório informar a base-URL da API.',
      );
    }
  }

  async create(orgId: string, dto: CreateAiModelProviderDto) {
    this.assertUsable(dto.provider, dto.baseUrl);
    const existing = await this.prisma.aiModelProvider.findUnique({
      where: { organizationId_modelId: { organizationId: orgId, modelId: dto.modelId } },
    });
    if (existing) {
      throw new ConflictException('Model ID already registered for this organization');
    }
    return this.prisma.aiModelProvider.create({
      data: {
        organizationId: orgId,
        provider: dto.provider,
        name: dto.name,
        modelId: dto.modelId,
        apiKey: dto.apiKey || null,
        baseUrl: dto.baseUrl || null,
      },
    });
  }

  async update(orgId: string, id: string, dto: UpdateAiModelProviderDto) {
    const model = await this.prisma.aiModelProvider.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!model) throw new NotFoundException('AI model not found');

    this.assertUsable(
      dto.provider ?? model.provider,
      dto.baseUrl !== undefined ? dto.baseUrl : model.baseUrl,
      'update',
    );

    if (dto.modelId && dto.modelId !== model.modelId) {
      const existing = await this.prisma.aiModelProvider.findUnique({
        where: { organizationId_modelId: { organizationId: orgId, modelId: dto.modelId } },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Model ID already registered');
      }
    }

    return this.prisma.aiModelProvider.update({
      where: { id },
      data: {
        ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.modelId !== undefined ? { modelId: dto.modelId } : {}),
        ...(dto.apiKey !== undefined ? { apiKey: dto.apiKey || null } : {}),
        ...(dto.baseUrl !== undefined ? { baseUrl: dto.baseUrl || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(orgId: string, id: string) {
    const model = await this.prisma.aiModelProvider.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!model) throw new NotFoundException('AI model not found');
    await this.prisma.aiModelProvider.delete({ where: { id } });
    return { success: true };
  }

  async listGlobalDepartments() {
    return this.prisma.globalDepartment.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Testa a conexão com o modelo enviando uma requisição simples.
   * Usa um prompt mínimo para verificar se a API key e o endpoint estão funcionando.
   */
  async testConnection(orgId: string, id: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const model = await this.prisma.aiModelProvider.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!model) throw new NotFoundException('AI model not found');

    const start = Date.now();
    if (!model.apiKey) {
      return {
        success: false,
        message: 'Falha: nenhuma chave de API salva para este modelo.',
        latencyMs: 0,
      };
    }

    try {
      let content = '';

      // O transporte tem que ser o MESMO que o runtime usa, senão o teste passa
      // (ou falha) por um motivo diferente do que vai acontecer de verdade.
      if (resolveTransport(model.provider) === 'anthropic') {
        const anthropicBase = resolveBaseUrl(model.provider, model.baseUrl);
        const anthropic = new Anthropic({
          apiKey: model.apiKey,
          ...(anthropicBase ? { baseURL: anthropicBase } : {}),
          timeout: 30_000,
          maxRetries: 0,
        });
        const resp = await anthropic.messages.create({
          model: model.modelId,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Responda apenas: ok' }],
        });
        content = resp.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
      } else {
        const baseURL = resolveBaseUrl(model.provider, model.baseUrl);
        if (!baseURL) {
          return {
            success: false,
            message:
              'Falha: este motor precisa de uma base-URL. Edite o modelo e informe o endereço da API.',
            latencyMs: 0,
          };
        }
        const client = new OpenAI({
          apiKey: model.apiKey,
          baseURL,
          timeout: 30_000,
          maxRetries: 0,
        });
        const resp = await client.chat.completions.create({
          model: model.modelId,
          messages: [{ role: 'user', content: 'Responda apenas: ok' }],
          max_tokens: 10,
          temperature: 0,
        });
        content = resp.choices?.[0]?.message?.content || '';
      }

      const latency = Date.now() - start;
      this.logger.log({
        msg: 'model_test_ok',
        modelId: model.modelId,
        provider: model.provider,
        latency,
        response: content,
      });

      return {
        success: true,
        message: `Conexão OK (${latency}ms) — respondeu "${content.trim().slice(0, 20)}"`,
        latencyMs: latency,
      };
    } catch (err: any) {
      const latency = Date.now() - start;
      const message = err?.message || 'Erro desconhecido ao conectar';
      this.logger.warn({
        msg: 'model_test_failed',
        modelId: model.modelId,
        provider: model.provider,
        latency,
        error: message,
      });
      return { success: false, message: `Falha: ${message}`, latencyMs: latency };
    }
  }
}
