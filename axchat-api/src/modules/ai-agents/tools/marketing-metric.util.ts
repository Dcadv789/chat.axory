import { PrismaService } from '../../../database/prisma.service';

export interface DailyMediaMetricInput {
  organizationId: string;
  agentId?: string | null;
  runId?: string | null;
  mediaId: string;
  mediaType?: string | null;
  caption?: string | null;
  permalink?: string | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  saved?: number | null;
  shares?: number | null;
  totalInteractions?: number | null;
  views?: number | null;
  raw?: any;
}

/**
 * Grava a métrica de um post como UM ponto por post por DIA (série temporal
 * diária). Se já existe uma captura do mesmo post hoje, ATUALIZA (não duplica);
 * senão cria uma linha nova. Assim rodar várias vezes no mesmo dia não polui a
 * tabela, e cada dia vira um ponto pra acompanhar a evolução.
 */
export async function upsertDailyMediaMetric(
  prisma: PrismaService,
  input: DailyMediaMetricInput,
): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const existing = await prisma.marketingMediaMetric.findFirst({
    where: {
      organizationId: input.organizationId,
      mediaId: input.mediaId,
      capturedAt: { gte: startOfDay },
    },
    orderBy: { capturedAt: 'desc' },
    select: { id: true, caption: true, permalink: true },
  });

  const data = {
    agentId: input.agentId ?? null,
    runId: input.runId ?? null,
    mediaType: input.mediaType ?? null,
    // Não apaga um caption/permalink já conhecido se a captura atual não trouxe.
    caption: input.caption ?? existing?.caption ?? null,
    permalink: input.permalink ?? existing?.permalink ?? null,
    reach: input.reach ?? null,
    likes: input.likes ?? null,
    comments: input.comments ?? null,
    saved: input.saved ?? null,
    shares: input.shares ?? null,
    totalInteractions: input.totalInteractions ?? null,
    views: input.views ?? null,
    raw: input.raw ?? undefined,
    capturedAt: new Date(),
  };

  if (existing) {
    await prisma.marketingMediaMetric.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.marketingMediaMetric.create({
      data: { organizationId: input.organizationId, mediaId: input.mediaId, ...data },
    });
  }
}

export interface DailyAdMetricInput {
  organizationId: string;
  agentId?: string | null;
  runId?: string | null;
  campaignId: string;
  campaignName?: string | null;
  objective?: string | null;
  status?: string | null;
  spend?: number | null;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  ctr?: number | null;
  cpc?: number | null;
  cpm?: number | null;
  conversions?: number | null;
  currency?: string | null;
  raw?: any;
  /**
   * Dia a que a métrica se refere (não "quando capturamos"). Com `time_increment=1`
   * a Meta devolve o gasto DE CADA DIA — cada dia vira um ponto real, carimbado no
   * seu próprio dia. Assim o gráfico é gasto/dia (não acumulado) e o filtro por
   * período bate com a data do dado. Default: hoje (compat.).
   */
  metricDate?: Date | null;
}

/** Igual ao de mídia, mas por CAMPANHA de anúncio: 1 ponto por campanha por dia. */
export async function upsertDailyAdMetric(
  prisma: PrismaService,
  input: DailyAdMetricInput,
): Promise<void> {
  const day = input.metricDate ?? new Date();
  const dayStart = new Date(day);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const existing = await prisma.marketingAdMetric.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      capturedAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { capturedAt: 'desc' },
    select: { id: true },
  });

  const data = {
    agentId: input.agentId ?? null,
    runId: input.runId ?? null,
    campaignName: input.campaignName ?? null,
    objective: input.objective ?? null,
    status: input.status ?? null,
    spend: input.spend ?? null,
    impressions: input.impressions ?? null,
    reach: input.reach ?? null,
    clicks: input.clicks ?? null,
    ctr: input.ctr ?? null,
    cpc: input.cpc ?? null,
    cpm: input.cpm ?? null,
    conversions: input.conversions ?? null,
    currency: input.currency ?? null,
    raw: input.raw ?? undefined,
    capturedAt: input.metricDate ?? new Date(),
  };

  if (existing) {
    await prisma.marketingAdMetric.update({ where: { id: existing.id }, data });
  } else {
    await prisma.marketingAdMetric.create({
      data: { organizationId: input.organizationId, campaignId: input.campaignId, ...data },
    });
  }
}
