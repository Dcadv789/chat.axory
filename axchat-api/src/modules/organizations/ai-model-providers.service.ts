import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAiModelProviderDto, UpdateAiModelProviderDto } from './dto/create-ai-model-provider.dto';
import OpenAI from 'openai';

@Injectable()
export class AiModelProvidersService {
  private readonly logger = new Logger(AiModelProvidersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.aiModelProvider.findMany({
      where: { organizationId: orgId },
      orderBy: [{ provider: 'asc' }, { name: 'asc' }],
    });
  }

  async create(orgId: string, dto: CreateAiModelProviderDto) {
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
    try {
      const baseURL = model.baseUrl || this.defaultBaseUrl(model.provider);
      const client = new OpenAI({
        apiKey: model.apiKey || '',
        ...(baseURL ? { baseURL } : {}),
      });

      const resp = await client.chat.completions.create({
        model: model.modelId,
        messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
        max_tokens: 10,
        temperature: 0,
      });

      const latency = Date.now() - start;
      const content = resp.choices?.[0]?.message?.content || '';
      this.logger.log({
        msg: 'model_test_ok',
        modelId: model.modelId,
        provider: model.provider,
        latency,
        response: content,
      });

      return { success: true, message: `Conexão OK (${latency}ms)`, latencyMs: latency };
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

  private defaultBaseUrl(provider: string): string | undefined {
    switch (provider) {
      case 'deepseek':
        return 'https://api.deepseek.com/v1';
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return undefined; // Anthropic uses its own SDK, but we can try OpenAI compat
      case 'google':
        return undefined;
      default:
        return undefined;
    }
  }
}
