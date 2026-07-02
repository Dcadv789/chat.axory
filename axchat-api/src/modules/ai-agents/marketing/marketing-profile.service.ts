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

  /**
   * Re-aplica (idempotente, in-process) correções nas definições das skills da
   * crew (ex.: métricas do Instagram) sem ter que desligar/ligar o add-on.
   */
  async resync(organizationId: string) {
    await this.ensureEnabled(organizationId);
    return this.provisioning.resyncSkills(organizationId);
  }

  /**
   * Reset de dados de TESTE da crew: apaga análises + atividades e arquiva as
   * conversas das crons de marketing. Análises/histórico de testes falhos
   * viram few-shot ruim (o modelo lê "já decidi hoje, manter" e não executa).
   * Métricas (posts/anúncios) são PRESERVADAS — série temporal é valiosa.
   */
  async resetTestData(organizationId: string) {
    await this.ensureEnabled(organizationId);
    return this.provisioning.resetTestData(organizationId);
  }

  /** Canais atendidos pela crew + externos disponíveis pra vincular. */
  async listCrewChannels(organizationId: string) {
    await this.ensureEnabled(organizationId);
    return this.provisioning.listCrewChannels(organizationId);
  }

  async attachCrewChannel(organizationId: string, channelId: string) {
    await this.ensureEnabled(organizationId);
    return this.provisioning.attachCrewChannel(organizationId, channelId);
  }

  async detachCrewChannel(organizationId: string, channelId: string) {
    await this.ensureEnabled(organizationId);
    return this.provisioning.detachCrewChannel(organizationId, channelId);
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
      ...(dto.analysisWindow ? { analysisWindow: dto.analysisWindow } : {}),
    };
    return this.prisma.marketingProfile.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
  }

  /**
   * Métricas de posts (série temporal). Filtra pela janela salva no perfil
   * (último mês/3/6/ano) — a mesma opção que a crew usa. Ordena da mais recente.
   */
  async mediaMetrics(organizationId: string, limit = 500) {
    await this.ensureEnabled(organizationId);
    const profile = await this.prisma.marketingProfile.findUnique({
      where: { organizationId },
      select: { analysisWindow: true },
    });
    const win = profile?.analysisWindow ?? 'LAST_MONTH';
    const days =
      win === 'LAST_YEAR'
        ? 365
        : win === 'LAST_6_MONTHS'
          ? 182
          : win === 'LAST_3_MONTHS'
            ? 91
            : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const metrics = await this.prisma.marketingMediaMetric.findMany({
      where: { organizationId, capturedAt: { gte: since } },
      orderBy: { capturedAt: 'desc' },
      take: limit,
    });
    return { window: win, since: since.toISOString(), metrics };
  }

  /** Métricas por campanha de anúncio (série temporal), filtradas pela janela. */
  async adMetrics(organizationId: string, limit = 500) {
    await this.ensureEnabled(organizationId);
    const profile = await this.prisma.marketingProfile.findUnique({
      where: { organizationId },
      select: { analysisWindow: true },
    });
    const win = profile?.analysisWindow ?? 'LAST_MONTH';
    const days =
      win === 'LAST_YEAR'
        ? 365
        : win === 'LAST_6_MONTHS'
          ? 182
          : win === 'LAST_3_MONTHS'
            ? 91
            : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const metrics = await this.prisma.marketingAdMetric.findMany({
      where: { organizationId, capturedAt: { gte: since } },
      orderBy: { capturedAt: 'desc' },
      take: limit,
    });
    return { window: win, since: since.toISOString(), metrics };
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
