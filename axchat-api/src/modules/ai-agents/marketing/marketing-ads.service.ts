import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { brtNow, countConversions } from './meta-insights.util';

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

  /** Ad sets de uma campanha (nome, status, orçamento, objetivo de otimização). */
  async listAdSets(orgId: string, campaignId: string): Promise<{ adsets: any[] }> {
    const { token } = await this.credentials(orgId);
    const fields = 'name,status,effective_status,daily_budget,lifetime_budget,optimization_goal';
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(campaignId)}/adsets?fields=${fields}&limit=100&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const json: any = await res.json();
    if (!res.ok) {
      throw new BadRequestException(`Meta Ads: ${json?.error?.message ?? `HTTP ${res.status}`}`);
    }
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    const adsets = data.map((a) => ({
      id: String(a.id),
      name: a.name ?? '(sem nome)',
      status: a.status ?? '—',
      effectiveStatus: a.effective_status ?? a.status ?? '—',
      dailyBudgetCents: this.num(a.daily_budget),
      lifetimeBudgetCents: this.num(a.lifetime_budget),
      optimizationGoal: a.optimization_goal ?? null,
    }));
    return { adsets };
  }

  /** Edita o orçamento diário da campanha (CBO). Valor em centavos. */
  async setCampaignBudget(
    orgId: string,
    campaignId: string,
    dailyBudgetCents: number,
  ): Promise<{ ok: boolean }> {
    if (!Number.isFinite(dailyBudgetCents) || dailyBudgetCents <= 0) {
      throw new BadRequestException('Orçamento diário inválido.');
    }
    const { token } = await this.credentials(orgId);
    const res = await fetch(`${GRAPH}/${encodeURIComponent(campaignId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_budget: Math.round(dailyBudgetCents), access_token: token }),
      signal: AbortSignal.timeout(15_000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      throw new BadRequestException(
        /budget/i.test(msg)
          ? `Meta Ads: ${msg}. (Se o orçamento estiver nos conjuntos de anúncios, edite lá — essa campanha não usa orçamento de campanha.)`
          : `Meta Ads: ${msg}`,
      );
    }
    this.logger.log(`Orçamento da campanha ${campaignId} → ${dailyBudgetCents} (org ${orgId})`);
    return { ok: true };
  }

  /** Posts recentes do Instagram (com miniatura) via IG Graph API. */
  async listInstagramPosts(orgId: string): Promise<{ posts: any[] }> {
    const [igUserId, token] = await Promise.all([
      this.resolve(orgId, 'IG_USER_ID'),
      this.resolve(orgId, 'IG_ACCESS_TOKEN'),
    ]);
    if (!igUserId || !token) {
      throw new BadRequestException(
        'Faltam IG_USER_ID e/ou IG_ACCESS_TOKEN. Configure em Configurações → Integrações.',
      );
    }
    const fields =
      'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(igUserId)}/media?fields=${fields}&limit=30&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const json: any = await res.json();
    if (!res.ok) {
      throw new BadRequestException(`Instagram: ${json?.error?.message ?? `HTTP ${res.status}`}`);
    }
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    const posts = data.map((m) => ({
      id: String(m.id),
      caption: m.caption ?? null,
      mediaType: m.media_type ?? null,
      // Vídeo usa thumbnail_url; imagem usa media_url.
      thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
      permalink: m.permalink ?? null,
      timestamp: m.timestamp ?? null,
      likes: this.num(m.like_count),
      comments: this.num(m.comments_count),
    }));
    return { posts };
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
  async overview(orgId: string, since?: string, until?: string, all = false): Promise<Record<string, unknown>> {
    const profile = await this.prisma.marketingProfile.findUnique({
      where: { organizationId: orgId },
      select: {
        monthlyAdBudgetCents: true,
        maxDailyBudgetCents: true,
        currency: true,
      },
    });

    const pad = (v: number) => String(v).padStart(2, '0');
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const validDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
    const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    // "Hoje" no fuso BRT (UTC-3).
    const nowBrt = brtNow();
    const curYear = nowBrt.getUTCFullYear();
    const curMonth = nowBrt.getUTCMonth();
    const curDay = nowBrt.getUTCDate();

    // MÊS DE REFERÊNCIA do pacing = mês da data final (until) do range escolhido;
    // sem range, o mês corrente. Assim, se o usuário olha maio/2025, a verba
    // mensal é a de maio/2025 — não a do mês atual.
    let refYear = curYear;
    let refMonth0 = curMonth;
    if (validDate(until)) {
      const [y, m] = until!.split('-').map(Number);
      refYear = y;
      refMonth0 = m - 1;
    }
    const daysInMonth = new Date(Date.UTC(refYear, refMonth0 + 1, 0)).getUTCDate();
    const firstOfMonth = `${refYear}-${pad(refMonth0 + 1)}-01`;
    const lastOfMonth = `${refYear}-${pad(refMonth0 + 1)}-${pad(daysInMonth)}`;

    const isCurrentMonth = refYear === curYear && refMonth0 === curMonth;
    const isPastMonth =
      refYear < curYear || (refYear === curYear && refMonth0 < curMonth);
    // Mês ainda não começou (usuário filtrou um período futuro): não há pacing.
    const isFutureMonth =
      refYear > curYear || (refYear === curYear && refMonth0 > curMonth);
    // Dias decorridos e restantes DO MÊS DE REFERÊNCIA.
    const dayOfMonth = isCurrentMonth ? curDay : isPastMonth ? daysInMonth : 0;
    const daysRemaining = isCurrentMonth ? daysInMonth - curDay + 1 : isPastMonth ? 0 : daysInMonth;
    // Fim da janela pra ler o gasto do mês (hoje, se for o mês corrente).
    const monthUntil = isCurrentMonth ? `${curYear}-${pad(curMonth + 1)}-${pad(curDay)}` : lastOfMonth;
    const monthLabel = `${MONTHS_PT[refMonth0]} de ${refYear}`;

    // Janela dos INSIGHTS (KPIs): o range da página; sem range, o mês de ref.
    // No modo "todo o período" (all), usa date_preset=maximum (histórico total).
    const insightsSince = validDate(since) ?? firstOfMonth;
    const insightsUntil = validDate(until) ?? monthUntil;
    const windowParam = all
      ? 'date_preset=maximum'
      : `time_range=${encodeURIComponent(JSON.stringify({ since: insightsSince, until: insightsUntil }))}`;

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
    } else if (isFutureMonth) {
      // Mês ainda não começou: não há o que buscar (e a Meta rejeita `since` no
      // futuro). Deixa os insights nulos, sem chamada nem warning enganoso.
    } else {
      try {
        const acct = adAccountId.replace(/^act_/, '');
        const url =
          `${GRAPH}/act_${encodeURIComponent(acct)}/insights` +
          `?fields=spend,impressions,reach,clicks,ctr,cpc,cpm,actions&${windowParam}` +
          `&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const json: any = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        const row = Array.isArray(json?.data) ? json.data[0] : null;
        if (row) {
          const conversions = countConversions(row.actions);
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

    // Ranking por campanha DIRETO da Meta (level=campaign) no período do range.
    // A Meta calcula o gasto/conversões do time_range exato → respeita o filtro:
    // campanha sem entrega no período nem aparece.
    let campaignRanking: any[] = [];
    if (adAccountId && token && !isFutureMonth) {
      try {
        const acct = adAccountId.replace(/^act_/, '');
        const url =
          `${GRAPH}/act_${encodeURIComponent(acct)}/insights` +
          `?level=campaign&${windowParam}&fields=campaign_name,spend,actions&limit=500` +
          `&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const json: any = await res.json();
        if (res.ok && Array.isArray(json?.data)) {
          campaignRanking = json.data.map((row: any) => {
            const spend = row?.spend != null ? Number(row.spend) : 0;
            const conversions = countConversions(row.actions) ?? 0;
            return {
              name: row.campaign_name ?? '(campanha)',
              spend: round2(spend),
              conversions,
              cpa: conversions > 0 ? round2(spend / conversions) : null,
            };
          });
          // Mais conversões primeiro; empate → menor gasto.
          campaignRanking.sort((a, b) => b.conversions - a.conversions || a.spend - b.spend);
        }
      } catch {
        /* ranking é opcional — não derruba o overview */
      }
    }

    // Coerência do card "Conversões": no nível conta a Meta às vezes NÃO expõe os
    // tipos de conversão (ex.: date_preset=maximum devolve só cliques/engajamento),
    // deixando o agregado nulo enquanto o ranking por campanha tem conversões. Nesse
    // caso, usa a soma do ranking pro card bater com a lista logo abaixo dele.
    if (insights.conversions == null && campaignRanking.length) {
      const sumConv = campaignRanking.reduce((acc, r) => acc + (r.conversions || 0), 0);
      if (sumConv > 0) insights.conversions = sumConv;
    }

    const currency = profile?.currency ?? 'BRL';
    const monthlyBudget = profile?.monthlyAdBudgetCents != null ? profile.monthlyAdBudgetCents / 100 : null;
    const maxDailyBudget = profile?.maxDailyBudgetCents != null ? profile.maxDailyBudgetCents / 100 : null;

    // Gasto do MÊS DE REFERÊNCIA (pra pacing). Se a janela de insights já é
    // exatamente esse mês, reusa; senão busca à parte (só quando há teto).
    const isMonthWindow = !all && insightsSince === firstOfMonth && insightsUntil === monthUntil;
    let spentMonth: number | null = isMonthWindow ? insights.spend : null;
    if (spentMonth == null && monthlyBudget != null && adAccountId && token && !isFutureMonth) {
      try {
        const acct = adAccountId.replace(/^act_/, '');
        const tr = encodeURIComponent(JSON.stringify({ since: firstOfMonth, until: monthUntil }));
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
    if (monthlyBudget != null && spentMonth != null && !isFutureMonth) {
      const remaining = round2(monthlyBudget - spentMonth);
      const elapsed = dayOfMonth; // dias já decorridos do mês de referência
      const dailyRunRate = elapsed > 0 ? round2(spentMonth / elapsed) : 0;
      // Mês passado já fechou → projeção = gasto real; mês corrente → extrapola.
      const projectedMonthEnd = isPastMonth
        ? round2(spentMonth)
        : elapsed > 0 ? round2(dailyRunRate * daysInMonth) : 0;
      const suggestedDailyForRest = daysRemaining > 0 ? round2(Math.max(0, remaining) / daysRemaining) : 0;
      const pctBudgetUsed = round2((spentMonth / monthlyBudget) * 100);
      const pctMonthElapsed = round2((elapsed / daysInMonth) * 100);
      const status =
        projectedMonthEnd > monthlyBudget * 1.1 ? 'ACIMA_DO_TETO'
          : projectedMonthEnd < monthlyBudget * 0.8 ? 'ABAIXO_DO_TETO' : 'NO_RITMO';
      pacing = { remaining, dailyRunRate, projectedMonthEnd, suggestedDailyForRest, pctBudgetUsed, pctMonthElapsed, status };
    }

    return {
      month: `${refYear}-${pad(refMonth0 + 1)}`,
      monthLabel,
      isCurrentMonth,
      isPastMonth,
      isFutureMonth,
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
      campaignRanking,
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
