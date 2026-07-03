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

  async attachCrewChannel(
    organizationId: string,
    channelId: string,
    lockSender?: boolean,
  ) {
    await this.ensureEnabled(organizationId);
    return this.provisioning.attachCrewChannel(
      organizationId,
      channelId,
      lockSender,
    );
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
   * Range de datas [gte, lte] pra filtrar as capturas. `since`/`until`
   * (YYYY-MM-DD) do filtro da página têm prioridade; senão, cai na janela do
   * perfil. O `lte` inclui o dia inteiro. IMPORTANTE: usa AMBOS os limites —
   * assim um período antigo (sem dados) volta vazio de verdade.
   */
  private async resolveRange(
    organizationId: string,
    since?: string,
    until?: string,
  ): Promise<{ gte: Date; lte: Date; window: string }> {
    const parse = (s?: string): Date | null => {
      if (!s) return null;
      const d = new Date(`${s}T00:00:00`);
      return isNaN(d.getTime()) ? null : d;
    };
    const gte = parse(since);
    const lte = parse(until);
    if (gte && lte) {
      lte.setHours(23, 59, 59, 999);
      return { gte, lte, window: `${since}_${until}` };
    }
    const profile = await this.prisma.marketingProfile.findUnique({
      where: { organizationId },
      select: { analysisWindow: true },
    });
    const win = profile?.analysisWindow ?? 'LAST_MONTH';
    const d =
      win === 'LAST_YEAR' ? 365 : win === 'LAST_6_MONTHS' ? 182 : win === 'LAST_3_MONTHS' ? 91 : 30;
    return { gte: new Date(Date.now() - d * 24 * 60 * 60 * 1000), lte: new Date(), window: win };
  }

  async mediaMetrics(organizationId: string, limit = 500, since?: string, until?: string, all = false) {
    await this.ensureEnabled(organizationId);
    if (all) {
      const metrics = await this.prisma.marketingMediaMetric.findMany({
        where: { organizationId },
        orderBy: { capturedAt: 'desc' },
        take: limit,
      });
      return { window: 'ALL', since: null, until: null, metrics };
    }
    const { gte, lte, window } = await this.resolveRange(organizationId, since, until);
    const metrics = await this.prisma.marketingMediaMetric.findMany({
      where: { organizationId, capturedAt: { gte, lte } },
      orderBy: { capturedAt: 'desc' },
      take: limit,
    });
    return { window, since: gte.toISOString(), until: lte.toISOString(), metrics };
  }

  /** Métricas por campanha de anúncio (série temporal), filtradas pelo range. */
  async adMetrics(organizationId: string, limit = 500, since?: string, until?: string, all = false) {
    await this.ensureEnabled(organizationId);
    if (all) {
      const metrics = await this.prisma.marketingAdMetric.findMany({
        where: { organizationId },
        orderBy: { capturedAt: 'desc' },
        take: limit,
      });
      return { window: 'ALL', since: null, until: null, metrics };
    }
    const { gte, lte, window } = await this.resolveRange(organizationId, since, until);
    const metrics = await this.prisma.marketingAdMetric.findMany({
      where: { organizationId, capturedAt: { gte, lte } },
      orderBy: { capturedAt: 'desc' },
      take: limit,
    });
    return { window, since: gte.toISOString(), until: lte.toISOString(), metrics };
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
