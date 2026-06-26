import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertMarketingProfileDto } from './dto/upsert-marketing-profile.dto';

@Injectable()
export class MarketingProfileService {
  constructor(private readonly prisma: PrismaService) {}

  get(organizationId: string) {
    return this.prisma.marketingProfile.findUnique({
      where: { organizationId },
    });
  }

  upsert(organizationId: string, dto: UpsertMarketingProfileDto) {
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
