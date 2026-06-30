import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface DateRange {
  from: Date;
  to: Date;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(organizationId: string, range: DateRange) {
    const where = { organizationId, deletedAt: null, createdAt: { gte: range.from, lte: range.to } };
    const prevFrom = new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime()));
    const prevWhere = { organizationId, deletedAt: null, createdAt: { gte: prevFrom, lte: range.from } };

    const [
      totalConversations,
      prevTotal,
      openConversations,
      pendingConversations,
      waitingConversations,
      botConversations,
      stuckConversations,
      totalMessages,
      prevMessages,
      closedInPeriod,
      prevClosedInPeriod,
    ] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.count({ where: prevWhere }),
      this.prisma.conversation.count({ where: { organizationId, status: 'OPEN', deletedAt: null } }),
      this.prisma.conversation.count({ where: { organizationId, status: 'PENDING', deletedAt: null } }),
      this.prisma.conversation.count({ where: { organizationId, status: 'WAITING', deletedAt: null } }),
      this.prisma.conversation.count({ where: { organizationId, status: 'BOT', deletedAt: null } }),
      this.prisma.conversation.count({
        where: { organizationId, isStuck: true, deletedAt: null },
      }),
      this.prisma.message.count({ where: { conversation: { organizationId, deletedAt: null }, createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.message.count({ where: { conversation: { organizationId, deletedAt: null }, createdAt: { gte: prevFrom, lte: range.from } } }),
      this.prisma.conversation.count({
        where: { organizationId, deletedAt: null, status: 'CLOSED', closedAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.conversation.count({
        where: { organizationId, deletedAt: null, status: 'CLOSED', closedAt: { gte: prevFrom, lte: range.from } },
      }),
    ]);

    const [avgFirstResponse, prevAvgFirstResponse] = await Promise.all([
      this.getAvgFirstResponseTime(organizationId, range),
      this.getAvgFirstResponseTime(organizationId, { from: prevFrom, to: range.from }),
    ]);
    const avgResolution = await this.getAvgResolutionTime(organizationId, range);
    const [slaCompliance, prevSlaCompliance] = await Promise.all([
      this.getSlaCompliance(organizationId, range),
      this.getSlaCompliance(organizationId, { from: prevFrom, to: range.from }),
    ]);

    const [closedNoReopen, csatAgg, prevCsatAgg] = await Promise.all([
      this.prisma.conversation.count({
        where: {
          organizationId, deletedAt: null, status: 'CLOSED',
          closedAt: { gte: range.from, lte: range.to },
          reopenedCount: 0,
        },
      }),
      this.prisma.conversationRating.aggregate({
        where: { organizationId, respondedAt: { gte: range.from, lte: range.to } },
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.conversationRating.aggregate({
        where: { organizationId, respondedAt: { gte: prevFrom, lte: range.from } },
        _avg: { score: true },
      }),
    ]);

    const fcrPercent =
      closedInPeriod > 0 ? Math.round((closedNoReopen / closedInPeriod) * 100) : null;
    const csatScore = csatAgg._avg.score !== null ? Math.round(csatAgg._avg.score * 10) / 10 : null;
    const prevCsatScore = prevCsatAgg._avg.score;
    const csatTrend =
      csatScore !== null && prevCsatScore !== null
        ? Math.round((csatScore - prevCsatScore) * 10) / 10
        : 0;

    const activeConversations = openConversations + pendingConversations + waitingConversations;

    const resolutionRatePercent =
      totalConversations > 0 ? Math.round((closedInPeriod / totalConversations) * 100) : null;
    const prevResolutionRatePercent = prevTotal > 0 ? (prevClosedInPeriod / prevTotal) * 100 : null;

    return {
      activeConversations,
      activeBreakdown: {
        pending: pendingConversations,
        open: openConversations,
        waiting: waitingConversations,
        bot: botConversations,
      },
      stuckConversations,

      avgFirstResponseMinutes: avgFirstResponse,
      avgFirstResponseTrend:
        avgFirstResponse !== null && prevAvgFirstResponse !== null
          ? this.calcTrend(avgFirstResponse, prevAvgFirstResponse)
          : 0,

      slaCompliancePercent: slaCompliance,
      slaTrend:
        slaCompliance !== null && prevSlaCompliance !== null
          ? slaCompliance - prevSlaCompliance
          : 0,

      resolutionRatePercent,
      resolutionTrend:
        resolutionRatePercent !== null && prevResolutionRatePercent !== null
          ? Math.round(resolutionRatePercent - prevResolutionRatePercent)
          : 0,

      fcrPercent,
      csatScore,
      csatResponses: csatAgg._count._all,
      csatTrend,

      totalConversations,
      conversationsTrend: this.calcTrend(totalConversations, prevTotal),
      openConversations,
      pendingConversations,
      totalMessages,
      messagesTrend: this.calcTrend(totalMessages, prevMessages),
      avgResolutionMinutes: avgResolution,
    };
  }

  async getKpiSparklines(organizationId: string, range: DateRange) {
    const dept = await this.prisma.department.findFirst({
      where: { organizationId, isDefault: true },
      select: { slaFirstResponse: true },
    });
    const slaMinutes = dept?.slaFirstResponse ?? null;

    // Agrega por dia-UTC no banco (antes puxava TODAS as conversas do período).
    // Bucketiza por created_at — mesma semântica do `toISOString().slice(0,10)`.
    const rows = await this.prisma.$queryRaw<
      {
        day: string;
        created: bigint;
        closed: bigint;
        tmr_sum: number | null;
        tmr_count: bigint;
        sla_within: bigint;
      }[]
    >`
      SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS created,
             COUNT(*) FILTER (
               WHERE status::text = 'CLOSED' AND closed_at IS NOT NULL
                 AND closed_at >= ${range.from} AND closed_at <= ${range.to}
             )::bigint AS closed,
             SUM(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60)
               FILTER (WHERE first_response_at IS NOT NULL) AS tmr_sum,
             COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::bigint AS tmr_count,
             COUNT(*) FILTER (
               WHERE first_response_at IS NOT NULL
                 AND EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60 <= ${slaMinutes ?? -1}
             )::bigint AS sla_within
      FROM conversations
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND created_at >= ${range.from}
        AND created_at <= ${range.to}
      GROUP BY 1
    `;

    const dayKeys = this.eachDay(range.from, range.to);
    const buckets = new Map<
      string,
      { created: number; closed: number; tmrSum: number; tmrCount: number; slaWithin: number; slaCount: number }
    >();
    for (const k of dayKeys) {
      buckets.set(k, { created: 0, closed: 0, tmrSum: 0, tmrCount: 0, slaWithin: 0, slaCount: 0 });
    }

    for (const r of rows) {
      const b = buckets.get(r.day);
      if (!b) continue;
      b.created = Number(r.created);
      b.closed = Number(r.closed);
      b.tmrSum = r.tmr_sum == null ? 0 : Number(r.tmr_sum);
      b.tmrCount = Number(r.tmr_count);
      // slaCount só conta quando há SLA configurado (preserva o comportamento antigo).
      b.slaWithin = slaMinutes !== null ? Number(r.sla_within) : 0;
      b.slaCount = slaMinutes !== null ? b.tmrCount : 0;
    }

    const active = dayKeys.map((d) => ({ date: d, value: buckets.get(d)!.created }));
    const firstResponse = dayKeys.map((d) => {
      const b = buckets.get(d)!;
      return { date: d, value: b.tmrCount > 0 ? Math.round(b.tmrSum / b.tmrCount) : 0 };
    });
    const sla = dayKeys.map((d) => {
      const b = buckets.get(d)!;
      return { date: d, value: b.slaCount > 0 ? Math.round((b.slaWithin / b.slaCount) * 100) : 0 };
    });
    const resolution = dayKeys.map((d) => {
      const b = buckets.get(d)!;
      return { date: d, value: b.created > 0 ? Math.round((b.closed / b.created) * 100) : 0 };
    });

    return { active, firstResponse, sla, resolution };
  }

  async getCsatBreakdown(organizationId: string, range: DateRange) {
    const [agg, ratings, recent] = await Promise.all([
      this.prisma.conversationRating.aggregate({
        where: { organizationId, respondedAt: { gte: range.from, lte: range.to } },
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.conversationRating.groupBy({
        by: ['score'],
        where: { organizationId, respondedAt: { gte: range.from, lte: range.to } },
        _count: true,
      }),
      this.prisma.conversationRating.findMany({
        where: {
          organizationId,
          respondedAt: { gte: range.from, lte: range.to },
          comment: { not: null },
        },
        orderBy: { respondedAt: 'desc' },
        take: 5,
        select: {
          id: true, score: true, comment: true, respondedAt: true,
          conversation: { select: { contact: { select: { name: true } } } },
        },
      }),
    ]);

    const totalRequested = await this.prisma.conversationRating.count({
      where: { organizationId, requestedAt: { gte: range.from, lte: range.to } },
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratings) distribution[r.score] = r._count;

    return {
      avgScore: agg._avg.score !== null ? Math.round(agg._avg.score * 10) / 10 : null,
      totalResponses: agg._count._all,
      totalRequested,
      responseRate: totalRequested > 0
        ? Math.round((agg._count._all / totalRequested) * 100)
        : null,
      distribution,
      recentComments: recent.map((r) => ({
        id: r.id,
        score: r.score,
        comment: r.comment,
        respondedAt: r.respondedAt,
        contactName: r.conversation.contact.name,
      })),
    };
  }

  async getReopens(organizationId: string, range: DateRange) {
    const reopened = await this.prisma.conversation.findMany({
      where: {
        organizationId,
        deletedAt: null,
        reopenedCount: { gt: 0 },
        reopenedAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        reopenedAt: true,
        reopenedCount: true,
        assignedTo: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    });

    const closedInPeriod = await this.prisma.conversation.count({
      where: { organizationId, deletedAt: null, status: 'CLOSED', closedAt: { gte: range.from, lte: range.to } },
    });

    const dayKeys = this.eachDay(range.from, range.to);
    const series = new Map<string, number>(dayKeys.map((d) => [d, 0]));
    for (const c of reopened) {
      if (!c.reopenedAt) continue;
      const k = c.reopenedAt.toISOString().slice(0, 10);
      if (series.has(k)) series.set(k, series.get(k)! + 1);
    }

    const totalReopens = reopened.reduce((s, r) => s + r.reopenedCount, 0);
    const reopenRate = closedInPeriod > 0
      ? Math.round((reopened.length / (closedInPeriod + reopened.length)) * 100)
      : null;

    return {
      totalReopens,
      uniqueConversationsReopened: reopened.length,
      reopenRate,
      series: dayKeys.map((d) => ({ date: d, value: series.get(d)! })),
      worstOffenders: reopened
        .sort((a, b) => b.reopenedCount - a.reopenedCount)
        .slice(0, 5)
        .map((c) => ({
          conversationId: c.id,
          contactName: c.contact.name,
          agentName: c.assignedTo?.name ?? null,
          reopenedCount: c.reopenedCount,
        })),
    };
  }

  private eachDay(from: Date, to: Date): string[] {
    const days: string[] = [];
    const cur = new Date(from);
    cur.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);
    while (cur <= end) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }

  async getVolumeByDay(organizationId: string, range: DateRange) {
    // Agrega no banco (antes puxava todas as conversas do período). Bucketiza
    // por dia-UTC — mesma semântica do toISOString().slice(0,10) anterior.
    const rows = await this.prisma.$queryRaw<{ day: string; cnt: bigint }[]>`
      SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS cnt
      FROM conversations
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND created_at >= ${range.from}
        AND created_at <= ${range.to}
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({ date: r.day, count: Number(r.cnt) }));
  }

  async getVolumeByChannel(organizationId: string, range: DateRange) {
    const result = await this.prisma.conversation.groupBy({
      by: ['channelId'],
      where: { organizationId, deletedAt: null, createdAt: { gte: range.from, lte: range.to } },
      _count: true,
    });

    const channels = await this.prisma.channel.findMany({
      where: { organizationId },
      select: { id: true, name: true, type: true },
    });

    return result.map((r) => {
      const ch = channels.find((c) => c.id === r.channelId);
      return { channelId: r.channelId, channelName: ch?.name || 'Unknown', channelType: ch?.type, count: r._count };
    });
  }

  async getVolumeByStatus(organizationId: string) {
    const result = await this.prisma.conversation.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null },
      _count: true,
    });
    return result.map((r) => ({ status: r.status, count: r._count }));
  }

  async getAgentPerformance(organizationId: string, range: DateRange) {
    // Agrega por agente no banco (total/fechadas + médias de TMR e resolução),
    // em vez de puxar todas as conversas e reduzir em JS.
    const [rows, currentLoadGroups] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          avatar_url: string | null;
          total: bigint;
          closed: bigint;
          resp_avg: number | null;
          res_avg: number | null;
        }[]
      >`
        SELECT u.id AS id, u.name AS name, u.avatar_url AS avatar_url,
               COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE c.status::text = 'CLOSED')::bigint AS closed,
               AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) / 60)
                 FILTER (WHERE c.first_response_at IS NOT NULL) AS resp_avg,
               AVG(EXTRACT(EPOCH FROM (c.closed_at - c.created_at)) / 60)
                 FILTER (WHERE c.status::text = 'CLOSED' AND c.closed_at IS NOT NULL) AS res_avg
        FROM conversations c
        JOIN users u ON u.id = c.assigned_to_id
        WHERE c.organization_id = ${organizationId}
          AND c.deleted_at IS NULL
          AND c.assigned_to_id IS NOT NULL
          AND c.created_at >= ${range.from}
          AND c.created_at <= ${range.to}
        GROUP BY u.id, u.name, u.avatar_url
      `,
      this.prisma.conversation.groupBy({
        by: ['assignedToId'],
        where: {
          organizationId,
          deletedAt: null,
          assignedToId: { not: null },
          status: { in: ['OPEN', 'PENDING', 'WAITING'] },
        },
        _count: true,
      }),
    ]);

    const currentLoad = new Map<string, number>();
    for (const g of currentLoadGroups) {
      if (g.assignedToId) currentLoad.set(g.assignedToId, g._count);
    }

    return rows.map((r) => {
      const total = Number(r.total);
      const closed = Number(r.closed);
      return {
        agent: { id: r.id, name: r.name, avatarUrl: r.avatar_url },
        totalConversations: total,
        closedConversations: closed,
        activeConversations: currentLoad.get(r.id) ?? 0,
        resolutionRate: total > 0 ? Math.round((closed / total) * 100) : 0,
        avgFirstResponseMinutes: r.resp_avg == null ? null : Math.round(Number(r.resp_avg)),
        avgResolutionMinutes: r.res_avg == null ? null : Math.round(Number(r.res_avg)),
      };
    });
  }

  async getVolumeFlow(organizationId: string, range: DateRange) {
    // Duas agregações por dia-UTC no banco: abertas (created_at) e fechadas
    // (closed_at), cada uma na sua data — antes puxava todas as conversas.
    const [createdRows, closedRows] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; cnt: bigint }[]>`
        SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::bigint AS cnt
        FROM conversations
        WHERE organization_id = ${organizationId}
          AND deleted_at IS NULL
          AND created_at >= ${range.from} AND created_at <= ${range.to}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ day: string; cnt: bigint }[]>`
        SELECT to_char((closed_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::bigint AS cnt
        FROM conversations
        WHERE organization_id = ${organizationId}
          AND deleted_at IS NULL
          AND closed_at >= ${range.from} AND closed_at <= ${range.to}
        GROUP BY 1
      `,
    ]);

    const dayKeys = this.eachDay(range.from, range.to);
    const buckets = new Map<string, { created: number; closed: number }>();
    for (const k of dayKeys) buckets.set(k, { created: 0, closed: 0 });

    for (const r of createdRows) {
      const b = buckets.get(r.day);
      if (b) b.created = Number(r.cnt);
    }
    for (const r of closedRows) {
      const b = buckets.get(r.day);
      if (b) b.closed = Number(r.cnt);
    }

    return dayKeys.map((d) => ({ date: d, ...buckets.get(d)! }));
  }

  async getPeakHours(organizationId: string, range: DateRange) {
    // Agrega no banco: contagem por (dia-da-semana, hora) em UTC — mesma
    // semântica de getUTCDay()/getUTCHours() que antes era feita em JS sobre
    // TODAS as conversas do período.
    const rows = await this.prisma.$queryRaw<
      { dow: number; hour: number; cnt: bigint }[]
    >`
      SELECT EXTRACT(DOW FROM (created_at AT TIME ZONE 'UTC'))::int AS dow,
             EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC'))::int AS hour,
             COUNT(*)::bigint AS cnt
      FROM conversations
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND created_at >= ${range.from}
        AND created_at <= ${range.to}
      GROUP BY 1, 2
    `;

    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const r of rows) {
      const n = Number(r.cnt);
      matrix[r.dow][r.hour] = n;
      if (n > max) max = n;
    }
    return { matrix, max };
  }

  async getMessagesFlow(organizationId: string, range: DateRange) {
    // Agrega no banco (antes puxava TODAS as mensagens do período pra contar em
    // JS). Bucketiza por dia-UTC — mesma semântica do `toISOString().slice(0,10)`
    // usado em `eachDay`.
    const rows = await this.prisma.$queryRaw<
      { day: string; direction: string; cnt: bigint }[]
    >`
      SELECT to_char((m.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
             m.direction::text AS direction,
             COUNT(*)::bigint AS cnt
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.organization_id = ${organizationId}
        AND c.deleted_at IS NULL
        AND m.created_at >= ${range.from}
        AND m.created_at <= ${range.to}
      GROUP BY 1, 2
    `;

    const dayKeys = this.eachDay(range.from, range.to);
    const buckets = new Map<string, { inbound: number; outbound: number }>();
    for (const k of dayKeys) buckets.set(k, { inbound: 0, outbound: 0 });

    for (const r of rows) {
      const b = buckets.get(r.day);
      if (!b) continue;
      if (r.direction === 'INBOUND') b.inbound += Number(r.cnt);
      else b.outbound += Number(r.cnt);
    }

    return dayKeys.map((d) => ({ date: d, ...buckets.get(d)! }));
  }

  async getBotPerformance(organizationId: string, range: DateRange) {
    // Conta no banco os 3 baldes (humano / resolvido-bot / em-andamento) —
    // mesma classificação de antes, sem trazer as linhas.
    const rows = await this.prisma.$queryRaw<
      { human: bigint; bot: bigint; inflight: bigint; total: bigint }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE assigned_to_id IS NOT NULL)::bigint AS human,
        COUNT(*) FILTER (
          WHERE assigned_to_id IS NULL AND status::text = 'CLOSED' AND closed_at IS NOT NULL
        )::bigint AS bot,
        COUNT(*) FILTER (
          WHERE assigned_to_id IS NULL AND NOT (status::text = 'CLOSED' AND closed_at IS NOT NULL)
        )::bigint AS inflight,
        COUNT(*)::bigint AS total
      FROM conversations
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND created_at >= ${range.from}
        AND created_at <= ${range.to}
    `;

    const botResolved = Number(rows[0]?.bot ?? 0);
    const humanHandled = Number(rows[0]?.human ?? 0);
    const inFlight = Number(rows[0]?.inflight ?? 0);

    const total = Number(rows[0]?.total ?? 0);
    const totalCompleted = botResolved + humanHandled;

    return {
      botResolved,
      humanHandled,
      inFlight,
      total,
      botResolutionRate: totalCompleted > 0 ? Math.round((botResolved / totalCompleted) * 100) : null,
      escalationRate: totalCompleted > 0 ? Math.round((humanHandled / totalCompleted) * 100) : null,
    };
  }

  async getTopTags(organizationId: string, range: DateRange, limit = 5) {
    const tagged = await this.prisma.conversationTag.findMany({
      where: {
        conversation: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
      },
      select: { tag: { select: { id: true, name: true, color: true } } },
    });

    const counts = new Map<string, { id: string; name: string; color: string; count: number }>();
    for (const t of tagged) {
      const k = t.tag.id;
      if (!counts.has(k)) counts.set(k, { id: t.tag.id, name: t.tag.name, color: t.tag.color, count: 0 });
      counts.get(k)!.count++;
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private async getAvgFirstResponseTime(organizationId: string, range: DateRange): Promise<number | null> {
    // AVG no banco (AVG sobre zero linhas retorna NULL => mesmo `null` de antes).
    const rows = await this.prisma.$queryRaw<{ avg_min: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60) AS avg_min
      FROM conversations
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND first_response_at IS NOT NULL
        AND created_at >= ${range.from}
        AND created_at <= ${range.to}
    `;
    const avg = rows[0]?.avg_min;
    return avg == null ? null : Math.round(Number(avg));
  }

  private async getAvgResolutionTime(organizationId: string, range: DateRange): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ avg_min: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60) AS avg_min
      FROM conversations
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND closed_at IS NOT NULL
        AND created_at >= ${range.from}
        AND created_at <= ${range.to}
    `;
    const avg = rows[0]?.avg_min;
    return avg == null ? null : Math.round(Number(avg));
  }

  private async getSlaCompliance(organizationId: string, range: DateRange): Promise<number | null> {
    const dept = await this.prisma.department.findFirst({
      where: { organizationId, isDefault: true },
      select: { slaFirstResponse: true },
    });
    if (!dept?.slaFirstResponse) return null;

    const slaMinutes = dept.slaFirstResponse;
    const rows = await this.prisma.$queryRaw<{ total: bigint; within: bigint }[]>`
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (
               WHERE EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60 <= ${slaMinutes}
             )::bigint AS within
      FROM conversations
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND first_response_at IS NOT NULL
        AND created_at >= ${range.from}
        AND created_at <= ${range.to}
    `;
    const total = Number(rows[0]?.total ?? 0);
    if (total === 0) return null;
    const within = Number(rows[0]?.within ?? 0);
    return Math.round((within / total) * 100);
  }

  private calcTrend(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }
}
