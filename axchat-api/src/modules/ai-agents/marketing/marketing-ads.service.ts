import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface AdCampaign {
  id: string;
  name: string;
  status: string; // ACTIVE | PAUSED | DELETED | ARCHIVED (config status)
  effectiveStatus: string; // status real (efetivo) da Meta
  objective: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
}

/**
 * Gestão DIRETA de anúncios (Meta Ads) pelo painel do dono — listar campanhas,
 * pausar/ativar e excluir. Ação do próprio usuário (não da IA), então executa
 * na hora, sem card de aprovação. Usa os secrets META_AD_ACCOUNT_ID /
 * META_ADS_ACCESS_TOKEN da org.
 */
@Injectable()
export class MarketingAdsService {
  private readonly logger = new Logger(MarketingAdsService.name);

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

  private async credentials(orgId: string): Promise<{ acct: string; token: string }> {
    const [adAccountId, token] = await Promise.all([
      this.resolve(orgId, 'META_AD_ACCOUNT_ID'),
      this.resolve(orgId, 'META_ADS_ACCESS_TOKEN'),
    ]);
    if (!adAccountId || !token) {
      throw new BadRequestException(
        'Faltam credenciais do Meta Ads (META_AD_ACCOUNT_ID / META_ADS_ACCESS_TOKEN). Configure em Configurações → Integrações.',
      );
    }
    return { acct: adAccountId.replace(/^act_/, ''), token };
  }

  private num(v: any): number | null {
    return v === undefined || v === null || v === '' ? null : Number(v);
  }

  async listCampaigns(orgId: string): Promise<{ campaigns: AdCampaign[] }> {
    const { acct, token } = await this.credentials(orgId);
    const fields =
      'name,status,effective_status,objective,daily_budget,lifetime_budget';
    let url =
      `${GRAPH}/act_${encodeURIComponent(acct)}/campaigns` +
      `?fields=${fields}&limit=100&access_token=${encodeURIComponent(token)}`;
    const all: any[] = [];
    for (let page = 0; page < 20; page++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json: any = await res.json();
      if (!res.ok) {
        throw new BadRequestException(
          `Meta Ads: ${json?.error?.message ?? `HTTP ${res.status}`}`,
        );
      }
      const data: any[] = Array.isArray(json?.data) ? json.data : [];
      all.push(...data);
      const next = json?.paging?.next;
      if (!next) break;
      url = next;
    }
    // daily_budget/lifetime_budget vêm em CENTAVOS (menor unidade).
    const campaigns: AdCampaign[] = all.map((c) => ({
      id: String(c.id),
      name: c.name ?? '(sem nome)',
      status: c.status ?? '—',
      effectiveStatus: c.effective_status ?? c.status ?? '—',
      objective: c.objective ?? null,
      dailyBudgetCents: this.num(c.daily_budget),
      lifetimeBudgetCents: this.num(c.lifetime_budget),
    }));
    return { campaigns };
  }

  async setCampaignStatus(
    orgId: string,
    campaignId: string,
    status: 'ACTIVE' | 'PAUSED',
  ): Promise<{ ok: boolean }> {
    if (status !== 'ACTIVE' && status !== 'PAUSED') {
      throw new BadRequestException('status deve ser ACTIVE ou PAUSED.');
    }
    const { token } = await this.credentials(orgId);
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(campaignId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, access_token: token }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(
        `Meta Ads: ${json?.error?.message ?? `HTTP ${res.status}`}`,
      );
    }
    this.logger.log(`Campanha ${campaignId} → ${status} (org ${orgId})`);
    return { ok: true };
  }

  /**
   * Resumo do painel: pacing de verba do mês + insights agregados da conta +
   * contagem de campanhas. Tolerante a falhas (devolve o que conseguir).
   */
  async overview(orgId: string, days?: number): Promise<Record<string, unknown>> {
    const profile = await this.prisma.marketingProfile.findUnique({
      where: { organizationId: orgId },
      select: {
        monthlyAdBudgetCents: true,
        maxDailyBudgetCents: true,
        currency: true,
      },
    });

    // Calendário no fuso BRT (UTC-3).
    const nowBrt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const year = nowBrt.getUTCFullYear();
    const month = nowBrt.getUTCMonth();
    const dayOfMonth = nowBrt.getUTCDate();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const daysRemaining = daysInMonth - dayOfMonth + 1;
    const pad = (v: number) => String(v).padStart(2, '0');
    const today = `${year}-${pad(month + 1)}-${pad(dayOfMonth)}`;
    const firstOfMonth = `${year}-${pad(month + 1)}-01`;
    const round2 = (v: number) => Math.round(v * 100) / 100;

    // Janela dos INSIGHTS: se veio `days` do filtro da página, usa os últimos
    // N dias; senão, o mês corrente. (O pacing de verba é sempre mensal.)
    const insightsSince =
      days && days > 0
        ? new Date(Date.now() - Math.min(days, 730) * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        : firstOfMonth;

    const [adAccountId, token] = await Promise.all([
      this.resolve(orgId, 'META_AD_ACCOUNT_ID'),
      this.resolve(orgId, 'META_ADS_ACCESS_TOKEN'),
    ]);

    // Insights agregados da conta no período.
    let insights: Record<string, number | null> = {
      spend: null, impressions: null, reach: null, clicks: null,
      ctr: null, cpc: null, cpm: null, conversions: null,
    };
    let warning: string | null = null;
    if (!adAccountId || !token) {
      warning = 'Credenciais do Meta Ads ausentes (configure em Integrações).';
    } else {
      try {
        const acct = adAccountId.replace(/^act_/, '');
        const timeRange = encodeURIComponent(JSON.stringify({ since: insightsSince, until: today }));
        const url =
          `${GRAPH}/act_${encodeURIComponent(acct)}/insights` +
          `?fields=spend,impressions,reach,clicks,ctr,cpc,cpm,actions&time_range=${timeRange}` +
          `&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const json: any = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        const row = Array.isArray(json?.data) ? json.data[0] : null;
        if (row) {
          let conversions: number | null = null;
          if (Array.isArray(row.actions)) {
            const rel = row.actions.filter((a: any) =>
              /lead|purchase|complete_registration|subscribe|contact|onsite_conversion/i.test(a?.action_type ?? ''),
            );
            if (rel.length) conversions = rel.reduce((s: number, a: any) => s + (Number(a.value) || 0), 0);
          }
          insights = {
            spend: this.num(row.spend),
            impressions: this.num(row.impressions),
            reach: this.num(row.reach),
            clicks: this.num(row.clicks),
            ctr: this.num(row.ctr),
            cpc: this.num(row.cpc),
            cpm: this.num(row.cpm),
            conversions,
          };
        } else {
          insights.spend = 0;
        }
      } catch (err: any) {
        warning = `Não consegui ler os insights da conta: ${err?.message ?? err}`;
        this.logger.warn(`overview insights: ${warning}`);
      }
    }

    // Contagem de campanhas (ativas/total). Best-effort.
    let campaignsTotal: number | null = null;
    let campaignsActive: number | null = null;
    if (adAccountId && token) {
      try {
        const { campaigns } = await this.listCampaigns(orgId);
        campaignsTotal = campaigns.length;
        campaignsActive = campaigns.filter((c) => c.effectiveStatus === 'ACTIVE').length;
      } catch {
        /* ignora — insights já cobrem o essencial */
      }
    }

    const currency = profile?.currency ?? 'BRL';
    const monthlyBudget = profile?.monthlyAdBudgetCents != null ? profile.monthlyAdBudgetCents / 100 : null;
    const maxDailyBudget = profile?.maxDailyBudgetCents != null ? profile.maxDailyBudgetCents / 100 : null;

    // Pacing é SEMPRE mensal. Se o filtro da página é o mês, reusa o insights;
    // se é outro período, busca o gasto do mês em separado (só quando há teto).
    let spentMonth: number | null = insightsSince === firstOfMonth ? insights.spend : null;
    if (spentMonth == null && monthlyBudget != null && adAccountId && token) {
      try {
        const acct = adAccountId.replace(/^act_/, '');
        const tr = encodeURIComponent(JSON.stringify({ since: firstOfMonth, until: today }));
        const res = await fetch(
          `${GRAPH}/act_${encodeURIComponent(acct)}/insights?fields=spend&time_range=${tr}&access_token=${encodeURIComponent(token)}`,
          { signal: AbortSignal.timeout(15_000) },
        );
        const json: any = await res.json();
        if (res.ok) {
          const row = Array.isArray(json?.data) ? json.data[0] : null;
          spentMonth = row?.spend != null ? Number(row.spend) : 0;
        }
      } catch {
        /* pacing fica sem gasto do mês */
      }
    }

    let pacing: Record<string, unknown> = {};
    if (monthlyBudget != null && spentMonth != null) {
      const remaining = round2(monthlyBudget - spentMonth);
      const dailyRunRate = round2(spentMonth / dayOfMonth);
      const projectedMonthEnd = round2(dailyRunRate * daysInMonth);
      const suggestedDailyForRest = round2(Math.max(0, remaining) / daysRemaining);
      const pctBudgetUsed = round2((spentMonth / monthlyBudget) * 100);
      const pctMonthElapsed = round2((dayOfMonth / daysInMonth) * 100);
      const status =
        projectedMonthEnd > monthlyBudget * 1.1 ? 'ACIMA_DO_TETO'
          : projectedMonthEnd < monthlyBudget * 0.8 ? 'ABAIXO_DO_TETO' : 'NO_RITMO';
      pacing = { remaining, dailyRunRate, projectedMonthEnd, suggestedDailyForRest, pctBudgetUsed, pctMonthElapsed, status };
    }

    return {
      month: `${year}-${pad(month + 1)}`,
      today,
      daysInMonth,
      dayOfMonth,
      daysRemaining,
      currency,
      monthlyBudget,
      maxDailyBudget,
      spentMonth,
      campaignsTotal,
      campaignsActive,
      insights,
      pacing,
      ...(warning ? { warning } : {}),
    };
  }

  async deleteCampaign(orgId: string, campaignId: string): Promise<{ ok: boolean }> {
    const { token } = await this.credentials(orgId);
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(campaignId)}?access_token=${encodeURIComponent(token)}`,
      { method: 'DELETE', signal: AbortSignal.timeout(15_000) },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(
        `Meta Ads: ${json?.error?.message ?? `HTTP ${res.status}`}`,
      );
    }
    this.logger.log(`Campanha ${campaignId} excluída (org ${orgId})`);
    return { ok: true };
  }
}
