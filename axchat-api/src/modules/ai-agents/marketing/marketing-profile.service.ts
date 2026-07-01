import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertMarketingProfileDto } from './dto/upsert-marketing-profile.dto';
import { MarketingProvisioningService } from './marketing-provisioning.service';

@Injectable()
export class MarketingProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: MarketingProvisioningService,
  ) {}

  /**
   * Garante o canal interno de comando da crew (idempotente) e devolve os ids
   * pro front abrir a conversa. Usado por orgs que ligaram o add-on antes desta
   * feature existir.
   */
  async ensureCrewChannel(organizationId: string) {
    await this.ensureEnabled(organizationId);
    return this.provisioning.ensureCrewChannel(organizationId);
  }

  /** Gate de plano: o módulo de Marketing é um add-on vendável (marketingEnabled). */
  private async ensureEnabled(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { marketingEnabled: true },
    });
    if (!org?.marketingEnabled) {
      throw new ForbiddenException(
        'Módulo de Marketing não habilitado para esta organização.',
      );
    }
  }

  async get(organizationId: string) {
    await this.ensureEnabled(organizationId);
    return this.prisma.marketingProfile.findUnique({
      where: { organizationId },
    });
  }

  async upsert(organizationId: string, dto: UpsertMarketingProfileDto) {
    await this.ensureEnabled(organizationId);
    const data = {
      companyDescription: dto.companyDescription ?? null,
      products: dto.products ?? null,
      targetAudience: dto.targetAudience ?? null,
      toneOfVoice: dto.toneOfVoice ?? null,
      guidelines: dto.guidelines ?? null,
      monthlyAdBudgetCents: dto.monthlyAdBudgetCents ?? null,
      maxDailyBudgetCents: dto.maxDailyBudgetCents ?? null,
      currency: dto.currency || 'BRL',
      externalRulesSkill: dto.externalRulesSkill ?? null,
    };
    return this.prisma.marketingProfile.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
  }

  /** Log + análises recentes pra um painel de auditoria do marketing. */
  async activity(organizationId: string, limit = 50) {
    await this.ensureEnabled(organizationId);
    const [activities, analyses] = await Promise.all([
      this.prisma.marketingActivity.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.marketingAnalysis.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);
    return { activities, analyses };
  }
}
