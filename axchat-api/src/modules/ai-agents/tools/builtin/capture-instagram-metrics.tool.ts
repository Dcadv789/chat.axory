import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';
import { upsertDailyMediaMetric } from '../marketing-metric.util';

const GRAPH = 'https://graph.facebook.com/v25.0';

const WINDOW_DAYS: Record<string, number> = {
  LAST_MONTH: 30,
  LAST_3_MONTHS: 91,
  LAST_6_MONTHS: 182,
  LAST_YEAR: 365,
};

/** Métricas de insights de mídia válidas na Graph atual (sem "impressions"). */
const METRICS = 'reach,likes,comments,saved,shares,total_interactions';

/**
 * Captura de UMA vez as métricas de TODOS os posts do Instagram dentro da janela
 * de análise configurada no perfil (último mês/3/6/ano). Lista as mídias
 * (id, legenda, permalink, tipo, data), busca as insights de cada post e grava
 * um snapshot em marketing_media_metrics — com a legenda, pra ficar legível.
 *
 * Faz o trabalho pesado no backend (loop + paginação) pra não depender do LLM
 * iterar post a post. O agente chama uma vez e todos os posts do período são
 * medidos e salvos. Resolve IG_USER_ID/IG_ACCESS_TOKEN via org secret (→ env).
 */
@Injectable()
export class CaptureInstagramMetricsTool implements AiTool {
  private readonly logger = new Logger(CaptureInstagramMetricsTool.name);

  readonly name = 'captureInstagramMetrics';
  readonly description =
    'Mede a performance de TODOS os posts do Instagram dentro da janela de análise da org (último mês/3/6/ano) de uma vez: lista os posts, puxa as métricas (alcance, curtidas, comentários, salvos, compartilhamentos, interações) de cada um e salva tudo. Use isto para "analisar os posts", "ver a performance do Instagram" ou "medir o desempenho" — é melhor que analyzeInstagramMedia post a post, porque cobre o período inteiro automaticamente. Retorna um resumo por post (com legenda).';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {},
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async resolve(orgId: string, key: string): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findFirst({
      where: { organizationId: orgId, key },
      select: { value: true },
    });
    return secret?.value ?? this.config.get<string>(key) ?? null;
  }

  async execute(
    _input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const [igUserId, token, profile] = await Promise.all([
      this.resolve(ctx.organizationId, 'IG_USER_ID'),
      this.resolve(ctx.organizationId, 'IG_ACCESS_TOKEN'),
      this.prisma.marketingProfile.findUnique({
        where: { organizationId: ctx.organizationId },
        select: { analysisWindow: true },
      }),
    ]);

    if (!igUserId || !token) {
      return {
        output: {
          ok: false,
          error: 'ig_credentials_missing',
          message:
            'Faltam IG_USER_ID e/ou IG_ACCESS_TOKEN. Peça pra configurar em Configurações → Integrações.',
        },
      };
    }

    const win = profile?.analysisWindow ?? 'LAST_MONTH';
    const days = WINDOW_DAYS[win] ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 1) Lista as mídias do período (segue paginação até sair da janela).
    let media: any[];
    try {
      media = await this.listMediaSince(igUserId, token, since);
    } catch (err: any) {
      return {
        output: {
          ok: false,
          error: 'list_media_failed',
          message: `Falha ao listar posts do Instagram: ${err.message}`,
        },
      };
    }

    if (media.length === 0) {
      return {
        output: {
          ok: true,
          captured: 0,
          window: win,
          message: `Nenhum post encontrado no período (${days} dias).`,
        },
      };
    }

    // 2) Insights + snapshot por post.
    const results: Array<{ mediaId: string; caption: string | null; reach: number | null }> = [];
    let captured = 0;
    for (const m of media) {
      const metrics = await this.fetchInsights(String(m.id), token);
      const caption = typeof m.caption === 'string' ? m.caption : null;
      try {
        await upsertDailyMediaMetric(this.prisma, {
          organizationId: ctx.organizationId,
          agentId: ctx.agentId,
          runId: ctx.runId,
          mediaId: String(m.id),
          mediaType: m.media_type ?? null,
          caption,
          permalink: m.permalink ?? null,
          reach: metrics.reach,
          likes: metrics.likes ?? (typeof m.like_count === 'number' ? m.like_count : null),
          comments: metrics.comments ?? (typeof m.comments_count === 'number' ? m.comments_count : null),
          saved: metrics.saved,
          shares: metrics.shares,
          totalInteractions: metrics.total_interactions,
          views: metrics.views,
          raw: metrics.raw,
        });
        captured++;
        results.push({ mediaId: String(m.id), caption, reach: metrics.reach });
      } catch (e: any) {
        this.logger.warn(
          `snapshot falhou (media ${m.id}): ${e?.message ?? e}`,
        );
      }
    }

    // Log de negócio.
    try {
      await this.prisma.marketingActivity.create({
        data: {
          organizationId: ctx.organizationId,
          agentId: ctx.agentId,
          runId: ctx.runId,
          action: 'captureInstagramMetrics',
          channel: 'INSTAGRAM',
          status: 'OK',
          title: `Métricas capturadas: ${captured} post(s) (${win})`,
          payload: { captured, window: win },
        },
      });
    } catch {
      /* fire-and-forget */
    }

    return {
      output: {
        ok: true,
        captured,
        window: win,
        message: `Capturei as métricas de ${captured} post(s) do período. Veja a tabela em Configurações → Marketing → Métricas dos posts.`,
        posts: results.map((r) => ({
          mediaId: r.mediaId,
          caption: r.caption ? r.caption.slice(0, 80) : null,
          reach: r.reach,
        })),
      },
    };
  }

  /** Lista mídias mais novas que `since`, seguindo paginação. Cap de segurança. */
  private async listMediaSince(
    igUserId: string,
    token: string,
    since: Date,
  ): Promise<any[]> {
    const fields = 'id,caption,media_type,permalink,timestamp,like_count,comments_count';
    let url =
      `${GRAPH}/${encodeURIComponent(igUserId)}/media` +
      `?fields=${fields}&limit=50&access_token=${encodeURIComponent(token)}`;
    const all: any[] = [];
    for (let page = 0; page < 20; page++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json: any = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      const data: any[] = Array.isArray(json?.data) ? json.data : [];
      let reachedOld = false;
      for (const m of data) {
        const ts = m.timestamp ? new Date(m.timestamp) : null;
        if (ts && ts < since) {
          reachedOld = true;
          break;
        }
        all.push(m);
      }
      const next = json?.paging?.next;
      if (reachedOld || !next) break;
      url = next;
    }
    return all;
  }

  /** Insights de uma mídia → objeto tipado + raw. Erros viram nulls (não trava). */
  private async fetchInsights(
    mediaId: string,
    token: string,
  ): Promise<{
    reach: number | null;
    likes: number | null;
    comments: number | null;
    saved: number | null;
    shares: number | null;
    total_interactions: number | null;
    views: number | null;
    raw: any;
  }> {
    const empty = {
      reach: null,
      likes: null,
      comments: null,
      saved: null,
      shares: null,
      total_interactions: null,
      views: null,
      raw: null,
    };
    try {
      const url =
        `${GRAPH}/${encodeURIComponent(mediaId)}/insights` +
        `?metric=${METRICS}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json: any = await res.json();
      if (!res.ok || !Array.isArray(json?.data)) return empty;
      const byName = new Map<string, number>();
      for (const item of json.data) {
        const v = item?.values?.[0]?.value ?? item?.total_value?.value;
        if (typeof item?.name === 'string' && typeof v === 'number') {
          byName.set(item.name, v);
        }
      }
      return {
        reach: byName.get('reach') ?? null,
        likes: byName.get('likes') ?? null,
        comments: byName.get('comments') ?? null,
        saved: byName.get('saved') ?? null,
        shares: byName.get('shares') ?? null,
        total_interactions: byName.get('total_interactions') ?? null,
        views: byName.get('views') ?? null,
        raw: json.data,
      };
    } catch {
      return empty;
    }
  }
}
