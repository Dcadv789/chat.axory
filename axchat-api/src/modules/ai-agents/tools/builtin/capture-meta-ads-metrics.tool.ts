import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';
import { upsertDailyAdMetric } from '../marketing-metric.util';
import { brtDateString, countConversions } from '../../marketing/meta-insights.util';

const GRAPH = 'https://graph.facebook.com/v25.0';

const WINDOW_DAYS: Record<string, number> = {
  LAST_MONTH: 30,
  LAST_3_MONTHS: 91,
  LAST_6_MONTHS: 182,
  LAST_YEAR: 365,
};

const INSIGHT_FIELDS = 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions,account_currency';

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Uma linha de insight por DIA (time_increment=1). */
interface DailyInsight {
  date: string; // YYYY-MM-DD (date_start)
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  conversions: number | null;
  currency: string | null;
  raw: any;
}

/**
 * Captura de UMA vez as métricas de TODAS as campanhas de anúncio (Meta Ads)
 * da org, dentro da janela de análise do perfil. Lista as campanhas, puxa os
 * insights de cada uma (spend, impressões, alcance, cliques, CTR, CPC, CPM,
 * conversões) e grava um snapshot por campanha (1 ponto por dia). É o caminho
 * pra "panorama dos anúncios" — o backend faz o loop, não o LLM.
 */
@Injectable()
export class CaptureMetaAdsMetricsTool implements AiTool {
  private readonly logger = new Logger(CaptureMetaAdsMetricsTool.name);

  readonly name = 'captureMetaAdsMetrics';
  readonly description =
    'Mede a performance de TODAS as campanhas de anúncio (Meta Ads) da org dentro da janela de análise, de uma vez: lista as campanhas, puxa as métricas de cada uma (investimento/spend, impressões, alcance, cliques, CTR, CPC, CPM, conversões) e salva tudo numa tabela. Use SEMPRE que pedirem "panorama dos anúncios", "métricas dos anúncios", "performance das campanhas" ou "quanto gastamos/quanto rendeu". Retorna um resumo por campanha.';
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
    const [adAccountId, token, profile] = await Promise.all([
      this.resolve(ctx.organizationId, 'META_AD_ACCOUNT_ID'),
      this.resolve(ctx.organizationId, 'META_ADS_ACCESS_TOKEN'),
      this.prisma.marketingProfile.findUnique({
        where: { organizationId: ctx.organizationId },
        select: { analysisWindow: true },
      }),
    ]);

    if (!adAccountId || !token) {
      return {
        output: {
          ok: false,
          error: 'meta_ads_credentials_missing',
          message:
            'Faltam META_AD_ACCOUNT_ID e/ou META_ADS_ACCESS_TOKEN. Configure em Configurações → Integrações.',
        },
      };
    }
    const acct = adAccountId.replace(/^act_/, '');

    const win = profile?.analysisWindow ?? 'LAST_MONTH';
    const days = WINDOW_DAYS[win] ?? 30;
    // Janela no MESMO fuso (BRT) que o painel usa pro pacing, pra não divergir.
    const timeRange = JSON.stringify({
      since: brtDateString(new Date(Date.now() - days * 24 * 60 * 60 * 1000)),
      until: brtDateString(),
    });

    // 1) Lista as campanhas.
    let campaigns: any[];
    try {
      campaigns = await this.listCampaigns(acct, token);
    } catch (err: any) {
      return {
        output: {
          ok: false,
          error: 'list_campaigns_failed',
          message: `Falha ao listar campanhas do Meta Ads: ${err.message}`,
        },
      };
    }
    if (campaigns.length === 0) {
      return {
        output: {
          ok: true,
          captured: 0,
          window: win,
          message: 'Nenhuma campanha encontrada na conta de anúncios.',
        },
      };
    }

    // 2) Insights DIÁRIOS (time_increment=1) + um snapshot por campanha por dia.
    // Cada dia é gravado no seu próprio dia (metricDate) → série temporal real:
    // gasto/dia, não acumulado; e o filtro por período bate com a data do dado.
    const results: Array<{ campaignId: string; name: string | null; spend: number }> = [];
    let points = 0;
    for (const c of campaigns) {
      const daily = await this.fetchDailyInsights(String(c.id), token, timeRange);
      let campaignSpend = 0;
      for (const d of daily) {
        try {
          await upsertDailyAdMetric(this.prisma, {
            organizationId: ctx.organizationId,
            agentId: ctx.agentId,
            runId: ctx.runId,
            campaignId: String(c.id),
            campaignName: c.name ?? null,
            objective: c.objective ?? null,
            status: c.effective_status ?? c.status ?? null,
            spend: d.spend,
            impressions: d.impressions,
            reach: d.reach,
            clicks: d.clicks,
            ctr: d.ctr,
            cpc: d.cpc,
            cpm: d.cpm,
            conversions: d.conversions,
            currency: d.currency,
            raw: d.raw,
            // Meio-dia UTC do dia do dado → cai sempre dentro do próprio dia.
            metricDate: new Date(`${d.date}T12:00:00.000Z`),
          });
          points++;
          campaignSpend += d.spend ?? 0;
        } catch (e: any) {
          this.logger.warn(`ad snapshot falhou (campaign ${c.id} ${d.date}): ${e?.message ?? e}`);
        }
      }
      results.push({ campaignId: String(c.id), name: c.name ?? null, spend: round2(campaignSpend) });
    }

    const capturedCampaigns = results.length;
    try {
      await this.prisma.marketingActivity.create({
        data: {
          organizationId: ctx.organizationId,
          agentId: ctx.agentId,
          runId: ctx.runId,
          action: 'captureMetaAdsMetrics',
          channel: 'META_ADS',
          status: 'OK',
          title: `Métricas de anúncios capturadas: ${capturedCampaigns} campanha(s), ${points} ponto(s) diário(s) (${win})`,
          payload: { campaigns: capturedCampaigns, points, window: win },
        },
      });
    } catch {
      /* fire-and-forget */
    }

    return {
      output: {
        ok: true,
        captured: capturedCampaigns,
        points,
        window: win,
        message: `Capturei as métricas de ${capturedCampaigns} campanha(s) (${points} ponto(s) diário(s)) do período. Veja a tabela em Configurações → Marketing → Métricas dos anúncios.`,
        campaigns: results.map((r) => ({
          campaignId: r.campaignId,
          name: r.name,
          spend: r.spend,
        })),
      },
    };
  }

  private async listCampaigns(acct: string, token: string): Promise<any[]> {
    const fields = 'name,status,effective_status,objective,daily_budget,lifetime_budget';
    let url =
      `${GRAPH}/act_${encodeURIComponent(acct)}/campaigns` +
      `?fields=${fields}&limit=100&access_token=${encodeURIComponent(token)}`;
    const all: any[] = [];
    for (let page = 0; page < 20; page++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      const data: any[] = Array.isArray(json?.data) ? json.data : [];
      all.push(...data);
      const next = json?.paging?.next;
      if (!next) break;
      url = next;
    }
    return all;
  }

  /**
   * Insights DIÁRIOS de uma campanha (uma linha por dia, via time_increment=1),
   * seguindo a paginação. Conversões contadas sem dupla contagem (helper único
   * compartilhado com o painel). Erros → devolve o que já tiver (não trava).
   */
  private async fetchDailyInsights(
    campaignId: string,
    token: string,
    timeRange: string,
  ): Promise<DailyInsight[]> {
    const n = (v: any) =>
      v === undefined || v === null || v === '' ? null : Number(v);
    const out: DailyInsight[] = [];
    try {
      let url =
        `${GRAPH}/${encodeURIComponent(campaignId)}/insights` +
        `?fields=${INSIGHT_FIELDS}&time_increment=1&time_range=${encodeURIComponent(timeRange)}` +
        `&limit=100&access_token=${encodeURIComponent(token)}`;
      for (let page = 0; page < 30; page++) {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const json: any = await res.json();
        if (!res.ok || !Array.isArray(json?.data)) break;
        for (const row of json.data) {
          const date = typeof row?.date_start === 'string' ? row.date_start : null;
          if (!date) continue;
          out.push({
            date,
            spend: n(row.spend),
            impressions: n(row.impressions),
            reach: n(row.reach),
            clicks: n(row.clicks),
            ctr: n(row.ctr),
            cpc: n(row.cpc),
            cpm: n(row.cpm),
            conversions: countConversions(row.actions),
            currency: row.account_currency ?? null,
            raw: row,
          });
        }
        const next = json?.paging?.next;
        if (!next) break;
        url = next;
      }
    } catch {
      /* devolve o que já coletou */
    }
    return out;
  }
}
