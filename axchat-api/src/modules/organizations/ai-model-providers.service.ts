import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAiModelProviderDto, UpdateAiModelProviderDto } from './dto/create-ai-model-provider.dto';

@Injectable()
export class AiModelProvidersService {
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
}
