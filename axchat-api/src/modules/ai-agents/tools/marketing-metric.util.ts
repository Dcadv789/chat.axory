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
