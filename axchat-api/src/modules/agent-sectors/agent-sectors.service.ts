import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateAgentSectorDto,
  UpdateAgentSectorDto,
  AddAgentToSectorDto,
  ReorderSectorsDto,
} from './dto/agent-sector.dto';

@Injectable()
export class AgentSectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.agentSector.findMany({
      where: { organizationId: orgId },
      orderBy: { order: 'asc' },
      include: {
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                kind: true,
                department: true,
                modelId: true,
                isActive: true,
              },
            },
          },
          orderBy: { agent: { name: 'asc' } },
        },
      },
    });
  }

  async getById(orgId: string, id: string) {
    const sector = await this.prisma.agentSector.findFirst({
      where: { id, organizationId: orgId },
      include: {
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                kind: true,
                department: true,
                modelId: true,
                isActive: true,
              },
            },
          },
          orderBy: { agent: { name: 'asc' } },
        },
      },
    });
    if (!sector) throw new NotFoundException('Setor não encontrado');
    return sector;
  }

  async create(orgId: string, dto: CreateAgentSectorDto) {
    const max = await this.prisma.agentSector.aggregate({
      where: { organizationId: orgId },
      _max: { order: true },
    });
    return this.prisma.agentSector.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        description: dto.description?.trim() || null,
        icon: dto.icon ?? 'Briefcase',
        color: dto.color ?? '#8b5cf6',
        order: (max._max.order ?? -1) + 1,
      },
    });
  }

  async update(orgId: string, id: string, dto: UpdateAgentSectorDto) {
    const sector = await this.prisma.agentSector.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!sector) throw new NotFoundException('Setor não encontrado');

    return this.prisma.agentSector.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
  }

  async remove(orgId: string, id: string) {
    const sector = await this.prisma.agentSector.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!sector) throw new NotFoundException('Setor não encontrado');

    await this.prisma.agentSector.delete({ where: { id } });
    return { success: true };
  }

  async addAgent(orgId: string, sectorId: string, dto: AddAgentToSectorDto) {
    const sector = await this.prisma.agentSector.findFirst({
      where: { id: sectorId, organizationId: orgId },
    });
    if (!sector) throw new NotFoundException('Setor não encontrado');

    const agent = await this.prisma.aiAgent.findFirst({
      where: { id: dto.agentId, organizationId: orgId },
    });
    if (!agent) throw new NotFoundException('Agente não encontrado');

    const existing = await this.prisma.agentSectorAgent.findUnique({
      where: { sectorId_agentId: { sectorId, agentId: dto.agentId } },
    });
    if (existing) throw new ConflictException('Agente já está neste setor');

    await this.prisma.agentSectorAgent.create({
      data: { sectorId, agentId: dto.agentId },
    });
    return this.getById(orgId, sectorId);
  }

  async removeAgent(orgId: string, sectorId: string, agentId: string) {
    const sector = await this.prisma.agentSector.findFirst({
      where: { id: sectorId, organizationId: orgId },
    });
    if (!sector) throw new NotFoundException('Setor não encontrado');

    const link = await this.prisma.agentSectorAgent.findUnique({
      where: { sectorId_agentId: { sectorId, agentId } },
    });
    if (!link) throw new NotFoundException('Agente não está neste setor');

    await this.prisma.agentSectorAgent.delete({
      where: { sectorId_agentId: { sectorId, agentId } },
    });
    return { success: true };
  }

  async reorder(orgId: string, dto: ReorderSectorsDto) {
    await this.prisma.$transaction(
      dto.sectorIds.map((id, idx) =>
        this.prisma.agentSector.update({
          where: { id },
          data: { order: idx },
        }),
      ),
    );
    return this.list(orgId);
  }
}
