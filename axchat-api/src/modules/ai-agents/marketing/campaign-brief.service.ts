import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertCampaignBriefDto } from './dto/campaign-brief.dto';

/**
 * Briefings de campanha.
 *
 * O perfil de marketing responde "quem é a empresa" e vale para tudo. O
 * briefing responde "o que ESTA campanha quer" — e é o que permite duas
 * campanhas simultâneas com objetivos opostos: uma captando lead frio para BPO
 * contábil, outra reativando cliente antigo de consultoria.
 */
@Injectable()
export class CampaignBriefService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string, incluirArquivadas = false) {
    return this.prisma.marketingCampaignBrief.findMany({
      where: {
        organizationId,
        ...(incluirArquivadas ? {} : { status: { not: 'ARCHIVED' } }),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(organizationId: string, dto: UpsertCampaignBriefDto) {
    return this.prisma.marketingCampaignBrief.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        objective: dto.objective.trim(),
        targetAudience: dto.targetAudience?.trim() || null,
        offer: dto.offer?.trim() || null,
        keyMessage: dto.keyMessage?.trim() || null,
        restrictions: dto.restrictions?.trim() || null,
        // Espaço em branco vindo de copiar-e-colar quebraria a comparação com
        // o `ad_id` da conversa e a campanha nunca casaria com o resultado.
        adIds: (dto.adIds ?? []).map((id) => id.trim()).filter(Boolean),
        monthlyBudgetCents: dto.monthlyBudgetCents ?? null,
        status: dto.status ?? 'ACTIVE',
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpsertCampaignBriefDto,
  ) {
    await this.assertExists(organizationId, id);
    return this.prisma.marketingCampaignBrief.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        objective: dto.objective.trim(),
        targetAudience: dto.targetAudience?.trim() || null,
        offer: dto.offer?.trim() || null,
        keyMessage: dto.keyMessage?.trim() || null,
        restrictions: dto.restrictions?.trim() || null,
        adIds: (dto.adIds ?? []).map((i) => i.trim()).filter(Boolean),
        monthlyBudgetCents: dto.monthlyBudgetCents ?? null,
        ...(dto.status ? { status: dto.status } : {}),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
  }

  async setStatus(
    organizationId: string,
    id: string,
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
  ) {
    await this.assertExists(organizationId, id);
    return this.prisma.marketingCampaignBrief.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Arquiva em vez de apagar: o briefing é o contexto de campanhas que já
   * rodaram, e apagar deixaria a análise histórica sem explicação do porquê
   * daquela campanha existir.
   */
  async archive(organizationId: string, id: string) {
    return this.setStatus(organizationId, id, 'ARCHIVED');
  }

  private async assertExists(organizationId: string, id: string) {
    const existe = await this.prisma.marketingCampaignBrief.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('Briefing não encontrado.');
  }
}
