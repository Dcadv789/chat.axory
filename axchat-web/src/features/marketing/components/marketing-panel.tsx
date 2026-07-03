'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone, Activity, BarChart3, Loader2, Play, Pause, Trash2, RefreshCw,
  LayoutDashboard, TrendingUp, TrendingDown, Wallet, MousePointerClick, Users, Eye, Target,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import {
  marketingService,
  type MediaMetricRow,
  type AdMetricRow,
  type AdCampaign,
  type MarketingOverview,
} from '@/features/marketing/services/marketing.service';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Tab = 'resumo' | 'gestao' | 'admetrics' | 'metrics' | 'activity';

const WINDOW_LABELS: Record<string, string> = {
  LAST_MONTH: 'último mês',
  LAST_3_MONTHS: 'últimos 3 meses',
  LAST_6_MONTHS: 'últimos 6 meses',
  LAST_YEAR: 'último ano',
};

const ANALYSIS_ACCENT: Record<string, string> = {
  PERFORMANCE: 'border-l-blue-400 bg-blue-50/60 dark:bg-blue-900/10',
  STRATEGY: 'border-l-violet-400 bg-violet-50/60 dark:bg-violet-900/10',
  MEASUREMENT: 'border-l-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/10',
  AUDIENCE: 'border-l-amber-400 bg-amber-50/60 dark:bg-amber-900/10',
  OUTRO: 'border-l-zinc-300 bg-zinc-50 dark:bg-white/5',
};

interface MetricsCols {
  engagement: boolean;
  identification: boolean;
  rate: boolean;
  delta: boolean;
}

const PERIODS: { days: number | undefined; label: string }[] = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 180, label: '6 meses' },
  { days: 365, label: '12 meses' },
];

export function MarketingPanel() {
  const [tab, setTab] = useState<Tab>('resumo');
  const [days, setDays] = useState<number>(30);
  const [cols, setCols] = useState<MetricsCols>({
    engagement: true,
    identification: true,
    rate: true,
    delta: true,
  });

  const { data: mediaMetrics } = useQuery({
    queryKey: ['marketing-media-metrics', days],
    queryFn: () => marketingService.mediaMetrics(days),
    enabled: tab === 'metrics',
    refetchInterval: 30000,
  });
  const { data: adMetrics } = useQuery({
    queryKey: ['marketing-ad-metrics', days],
    queryFn: () => marketingService.adMetrics(days),
    enabled: tab === 'admetrics',
    refetchInterval: 30000,
  });
  const { data: activity } = useQuery({
    queryKey: ['marketing-activity'],
    queryFn: () => marketingService.activity(),
    enabled: tab === 'activity',
    refetchInterval: 30000,
  });

  const TABS: { id: Tab; icon: React.ElementType; label: string; subtitle: string }[] = [
    { id: 'resumo', icon: LayoutDashboard, label: 'Resumo', subtitle: 'Verba do mês, desempenho da conta e campanhas num olhar' },
    { id: 'gestao', icon: Megaphone, label: 'Gestão de anúncios', subtitle: 'Pause, ative e exclua suas campanhas do Meta Ads' },
    { id: 'admetrics', icon: BarChart3, label: 'Métricas dos anúncios', subtitle: 'Desempenho por campanha ao longo do tempo' },
    { id: 'metrics', icon: BarChart3, label: 'Métricas dos posts', subtitle: 'Engajamento dos posts do Instagram' },
    { id: 'activity', icon: Activity, label: 'Atividade da crew', subtitle: 'Análises e ações registradas pelos agentes' },
  ];
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const ActiveIcon = active.icon;

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho — mesma altura do cabeçalho da sidebar (h-16) */}
      <header className="flex h-16 shrink-0 items-center border-b border-zinc-200 bg-white px-6 dark:border-white/10 dark:bg-black">
        <div className="flex min-w-0 items-center gap-2">
          <Megaphone className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-2 text-lg font-semibold leading-tight text-zinc-950 dark:text-zinc-50">
              <span>Marketing</span>
              <span className="font-normal text-zinc-300 dark:text-zinc-600">/</span>
              <span className="inline-flex items-center gap-1.5">
                <ActiveIcon className="h-4 w-4 text-zinc-400" />
                {active.label}
              </span>
            </h1>
            <p className="truncate text-xs text-zinc-500">{active.subtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto scrollbar-thin px-6 py-5">
        {/* Tabs em pílula — igual ao Configurações */}
        <nav className="w-full shrink-0 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
                  }`}
                >
                  <t.icon className="h-4 w-4 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Filtro de período — vale pra Resumo e Métricas */}
        {(tab === 'resumo' || tab === 'admetrics' || tab === 'metrics') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Período:</span>
            {PERIODS.map((per) => (
              <button
                key={per.days}
                onClick={() => setDays(per.days!)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  days === per.days
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
                }`}
              >
                {per.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'resumo' && <ResumoTab days={days} />}
        {tab === 'gestao' && <GestaoTab />}
        {tab === 'admetrics' && (
          <AdMetricsTab rows={adMetrics?.metrics ?? []} window={adMetrics?.window ?? 'LAST_MONTH'} />
        )}
        {tab === 'metrics' && (
          <MetricsTab
            rows={mediaMetrics?.metrics ?? []}
            window={mediaMetrics?.window ?? 'LAST_MONTH'}
            cols={cols}
            setCols={setCols}
          />
        )}
        {tab === 'activity' && <ActivityView activity={activity} />}
      </div>
    </div>
  );
}

// ─── Resumo (overview) ─────────────────────────────────────────

const fmtInt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'));
const fmtMoney = (n: number | null | undefined, cur = 'BRL') =>
  n == null ? '—' : `${cur === 'USD' ? '$' : 'R$'} ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDec = (n: number | null | undefined, suffix = '') =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suffix;

function ResumoTab({ days }: { days: number }) {
  const { data: ov, isLoading } = useQuery({
    queryKey: ['marketing-overview', days],
    queryFn: () => marketingService.overview(days),
    refetchInterval: 60000,
  });
  const { data: adMetrics } = useQuery({
    queryKey: ['marketing-ad-metrics', days],
    queryFn: () => marketingService.adMetrics(days),
    refetchInterval: 60000,
  });

  if (isLoading || !ov) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando resumo…
      </div>
    );
  }

  const cur = ov.currency;
  const p = ov.pacing ?? {};
  const spendSeries = aggregateSpendByDay(adMetrics?.metrics ?? []);
  const ranking = rankCampaigns(adMetrics?.metrics ?? []);

  const statusLabel: Record<string, { txt: string; cls: string; Icon: React.ElementType }> = {
    ACIMA_DO_TETO: { txt: 'Acima do teto', cls: 'text-rose-600 dark:text-rose-400', Icon: TrendingUp },
    ABAIXO_DO_TETO: { txt: 'Abaixo do teto', cls: 'text-amber-600 dark:text-amber-400', Icon: TrendingDown },
    NO_RITMO: { txt: 'No ritmo', cls: 'text-emerald-600 dark:text-emerald-400', Icon: TrendingUp },
  };
  const st = p.status ? statusLabel[p.status] : null;

  return (
    <div className="space-y-5">
      {ov.warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {ov.warning}
        </div>
      )}

      {/* Verba do mês */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <Wallet className="h-4 w-4 text-primary" /> Verba do mês
          </p>
          {st && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${st.cls}`}>
              <st.Icon className="h-3.5 w-3.5" /> {st.txt}
            </span>
          )}
        </div>

        {ov.monthlyBudget == null ? (
          <p className="mt-3 text-xs text-zinc-500">
            Sem teto de verba mensal configurado. Defina em Configurações → Marketing pra ver o pacing.
          </p>
        ) : (
          <>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {fmtMoney(ov.spentMonth, cur)}
                <span className="ml-1 text-sm font-normal text-zinc-400">/ {fmtMoney(ov.monthlyBudget, cur)}</span>
              </p>
              <p className="text-xs text-zinc-500">{fmtDec(p.pctBudgetUsed, '%')} usado</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
              <div
                className={`h-full rounded-full ${
                  p.status === 'ACIMA_DO_TETO' ? 'bg-rose-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(100, p.pctBudgetUsed ?? 0)}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Dias restantes" value={`${ov.daysRemaining}`} />
              <MiniStat label="Ritmo/dia" value={fmtMoney(p.dailyRunRate, cur)} />
              <MiniStat label="Projeção do mês" value={fmtMoney(p.projectedMonthEnd, cur)} />
              <MiniStat label="Sugestão/dia p/ resto" value={fmtMoney(p.suggestedDailyForRest, cur)} />
            </div>
          </>
        )}
      </div>

      {/* KPIs da conta */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={Wallet} label="Investido (mês)" value={fmtMoney(ov.insights.spend, cur)} accent="text-primary" />
        <KpiCard icon={Eye} label="Impressões" value={fmtInt(ov.insights.impressions)} accent="text-sky-500" />
        <KpiCard icon={Users} label="Alcance" value={fmtInt(ov.insights.reach)} accent="text-violet-500" />
        <KpiCard icon={MousePointerClick} label="Cliques" value={fmtInt(ov.insights.clicks)} accent="text-amber-500" />
        <KpiCard icon={BarChart3} label="CTR" value={fmtDec(ov.insights.ctr, '%')} accent="text-emerald-500" />
        <KpiCard icon={Wallet} label="CPC" value={fmtMoney(ov.insights.cpc, cur)} accent="text-primary" />
        <KpiCard icon={Target} label="Conversões" value={fmtInt(ov.insights.conversions)} accent="text-rose-500" />
        <KpiCard
          icon={Megaphone}
          label="Campanhas ativas"
          value={ov.campaignsActive == null ? '—' : `${ov.campaignsActive}/${ov.campaignsTotal ?? '?'}`}
          accent="text-emerald-600"
        />
      </div>

      {/* Gráfico: gasto por dia */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <BarChart3 className="h-4 w-4 text-primary" /> Gasto por dia (capturado)
        </p>
        {spendSeries.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-400">
            Sem série de gasto ainda. Peça pra crew o "panorama dos anúncios" pra popular a captura diária.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={spendSeries} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0047ff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0047ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-white/10" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" className="text-zinc-400" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-zinc-400" width={48} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: any) => [fmtMoney(Number(v), cur), 'Gasto']}
              />
              <Area type="monotone" dataKey="spend" stroke="#0047ff" strokeWidth={2} fill="url(#spendGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Ranking de campanhas por conversões/gasto */}
      {ranking.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RankCard title="Melhores campanhas" subtitle="por conversões no período" rows={ranking.slice(0, 5)} cur={cur} />
          {ranking.length > 5 && (
            <RankCard title="Piores campanhas" subtitle="menos conversões / mais custo" rows={ranking.slice(-5).reverse()} cur={cur} worst />
          )}
        </div>
      )}
    </div>
  );
}

interface RankRow { name: string; spend: number; conversions: number; cpa: number | null }

function RankCard({ title, subtitle, rows, cur, worst }: { title: string; subtitle: string; rows: RankRow[]; cur: string; worst?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
      <p className="text-[11px] text-zinc-400">{subtitle}</p>
      <div className="mt-3 space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.name + i} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-white/[0.03]">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                worst ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15'
              }`}>{i + 1}</span>
              <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300" title={r.name}>{r.name}</span>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{r.conversions} conv.</p>
              <p className="text-[10px] tabular-nums text-zinc-400">{fmtMoney(r.spend, cur)}{r.cpa != null ? ` · CPA ${fmtMoney(r.cpa, cur)}` : ''}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Agrega campanhas somando gasto+conversões (última captura por campanha) e ordena. */
function rankCampaigns(rows: AdMetricRow[]): RankRow[] {
  const latest = new Map<string, AdMetricRow>();
  // rows vem desc por capturedAt: a primeira vista de cada campanha é a mais recente.
  for (const r of rows) if (!latest.has(r.campaignId)) latest.set(r.campaignId, r);
  const list: RankRow[] = [...latest.values()].map((r) => {
    const spend = r.spend ?? 0;
    const conversions = r.conversions ?? 0;
    return { name: r.campaignName ?? `Campanha ${r.campaignId.slice(-8)}`, spend, conversions, cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : null };
  });
  return list.sort((a, b) => b.conversions - a.conversions || a.spend - b.spend);
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-white/[0.03]">
      <p className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{value}</p>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent}`} />
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

/** Soma alcance + interações por dia a partir das capturas de posts. */
function aggregateEngagementByDay(rows: MediaMetricRow[]): { day: string; reach: number; interactions: number }[] {
  const byDay = new Map<string, { reach: number; interactions: number }>();
  for (const r of rows) {
    const d = new Date(r.capturedAt);
    const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const acc = byDay.get(key) ?? { reach: 0, interactions: 0 };
    acc.reach += r.reach ?? 0;
    acc.interactions += r.totalInteractions ?? 0;
    byDay.set(key, acc);
  }
  return [...byDay.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => {
      const [da, ma] = a.day.split('/').map(Number);
      const [db, mb] = b.day.split('/').map(Number);
      return ma - mb || da - db;
    });
}

/** Soma o gasto por dia (rótulo DD/MM) a partir das capturas de anúncio. */
function aggregateSpendByDay(rows: AdMetricRow[]): { day: string; spend: number }[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (r.spend == null) continue;
    const d = new Date(r.capturedAt);
    const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    byDay.set(key, (byDay.get(key) ?? 0) + r.spend);
  }
  return [...byDay.entries()]
    .map(([day, spend]) => ({ day, spend: Math.round(spend * 100) / 100 }))
    .sort((a, b) => {
      const [da, ma] = a.day.split('/').map(Number);
      const [db, mb] = b.day.split('/').map(Number);
      return ma - mb || da - db;
    });
}

// ─── Gestão de anúncios (ao vivo) ──────────────────────────────

function GestaoTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['marketing-ad-campaigns'],
    queryFn: () => marketingService.listCampaigns(),
    refetchInterval: 30000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [toDelete, setToDelete] = useState<AdCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['marketing-ad-campaigns'] });

  const toggle = async (c: AdCampaign) => {
    const next = c.effectiveStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setBusy(c.id);
    try {
      await marketingService.setCampaignStatus(c.id, next);
      toast.success(next === 'ACTIVE' ? 'Campanha ativada' : 'Campanha pausada');
      invalidate();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha ao alterar status');
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await marketingService.deleteCampaign(toDelete.id);
      toast.success('Campanha excluída');
      setToDelete(null);
      invalidate();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha ao excluir');
    } finally {
      setDeleting(false);
    }
  };

  const money = (cents: number | null) =>
    cents == null ? '—' : `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500';
  const td = 'px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300';

  const q = search.trim().toLowerCase();
  const filtered = (data?.campaigns ?? []).filter((c) => {
    if (statusFilter === 'active' && c.effectiveStatus !== 'ACTIVE') return false;
    if (statusFilter === 'paused' && c.effectiveStatus === 'ACTIVE') return false;
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  });
  const STATUS_TABS: { id: 'all' | 'active' | 'paused'; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'active', label: 'Ativas' },
    { id: 'paused', label: 'Pausadas' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Suas campanhas no Meta Ads, ao vivo. Pause, ative ou exclua direto aqui.
          Criar campanhas novas é com a crew (peça o funil completo no chat da crew).
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {!isLoading && !isError && (data?.campaigns.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s.id
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
              }`}
            >
              {s.label}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar campanha…"
            className="ml-auto w-48 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs focus:border-primary focus:outline-none dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando campanhas…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {(error as any)?.response?.data?.message ?? 'Erro ao carregar campanhas. Verifique as credenciais do Meta Ads em Integrações.'}
        </div>
      ) : (data?.campaigns.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-5 py-10 text-center dark:border-white/10 dark:bg-black">
          <p className="text-sm text-zinc-400">Nenhuma campanha na conta de anúncios.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
          <table className="w-full border-collapse">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03]">
              <tr>
                <th className={th}>Campanha</th>
                <th className={th}>Status</th>
                <th className={th}>Orçamento/dia</th>
                <th className={th + ' text-right'}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={4} className={td + ' py-6 text-center text-zinc-400'}>Nenhuma campanha com esse filtro.</td></tr>
              )}
              {filtered.map((c) => {
                const on = c.effectiveStatus === 'ACTIVE';
                return (
                  <tr key={c.id} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                    <td className={td + ' max-w-[280px]'}>
                      <span className="block truncate font-medium" title={c.name}>{c.name}</span>
                      {c.objective && <span className="text-[10px] text-zinc-400">{c.objective}</span>}
                    </td>
                    <td className={td}>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        on
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-white/10'
                      }`}>
                        {on ? 'ATIVA' : (c.effectiveStatus ?? c.status)}
                      </span>
                    </td>
                    <td className={td + ' tabular-nums'}>{money(c.dailyBudgetCents)}</td>
                    <td className={td}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggle(c)}
                          disabled={busy === c.id}
                          title={on ? 'Pausar' : 'Ativar'}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                            on
                              ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                              : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                          }`}
                        >
                          {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          {on ? 'Pausar' : 'Ativar'}
                        </button>
                        <button
                          onClick={() => setToDelete(c)}
                          title="Excluir"
                          className="inline-flex items-center rounded-md p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        variant="danger"
        loading={deleting}
        title="Excluir campanha?"
        description={`A campanha "${toDelete?.name}" será excluída no Meta Ads. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setToDelete(null)}
      />
    </div>
  );
}

// ─── Métricas dos anúncios ─────────────────────────────────────

function AdMetricsTab({ rows, window }: { rows: AdMetricRow[]; window: string }) {
  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500';
  const td = 'px-3 py-2 text-sm tabular-nums text-zinc-700 dark:text-zinc-300';
  const int = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR'));
  const money = (n: number | null, cur: string | null) =>
    n == null ? '—' : `${cur === 'USD' ? '$' : 'R$'} ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dec = (n: number | null, suffix = '') =>
    n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suffix;
  const statusChip = (s: string | null) => (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
      s === 'ACTIVE'
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
        : 'bg-zinc-100 text-zinc-500 dark:bg-white/10'
    }`}>{s ?? '—'}</span>
  );

  const spendSeries = aggregateSpendByDay(rows);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Uma linha por campanha (captura diária). Período:{' '}
        <span className="font-medium">{WINDOW_LABELS[window] ?? window}</span>. A janela é ajustada em Configurações → Marketing.
      </p>
      {spendSeries.length > 1 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
          <p className="mb-2 text-xs font-medium text-zinc-500">Gasto total por dia</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={spendSeries} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="adSpendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0047ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0047ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-white/10" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" className="text-zinc-400" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-zinc-400" width={48} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [`R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Gasto']} />
              <Area type="monotone" dataKey="spend" stroke="#0047ff" strokeWidth={2} fill="url(#adSpendGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-5 py-10 text-center dark:border-white/10 dark:bg-black">
          <p className="text-sm text-zinc-400">Nenhuma métrica de anúncio ainda. Peça pra crew o "panorama dos anúncios".</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
          <table className="w-full border-collapse">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03]">
              <tr>
                <th className={th}>Campanha</th><th className={th}>Status</th><th className={th}>Investido</th>
                <th className={th}>Impressões</th><th className={th}>Alcance</th><th className={th}>Cliques</th>
                <th className={th}>CTR</th><th className={th}>CPC</th><th className={th}>CPM</th>
                <th className={th}>Conversões</th><th className={th}>Capturado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                  <td className={td + ' max-w-[220px]'}>
                    <span className="block truncate font-medium" title={r.campaignName ?? r.campaignId}>
                      {r.campaignName ?? `Campanha ${r.campaignId.slice(-8)}`}
                    </span>
                    {r.objective && <span className="text-[10px] text-zinc-400">{r.objective}</span>}
                  </td>
                  <td className={td}>{statusChip(r.status)}</td>
                  <td className={td + ' font-medium'}>{money(r.spend, r.currency)}</td>
                  <td className={td}>{int(r.impressions)}</td>
                  <td className={td}>{int(r.reach)}</td>
                  <td className={td}>{int(r.clicks)}</td>
                  <td className={td}>{dec(r.ctr, '%')}</td>
                  <td className={td}>{money(r.cpc, r.currency)}</td>
                  <td className={td}>{money(r.cpm, r.currency)}</td>
                  <td className={td + ' font-medium'}>{int(r.conversions)}</td>
                  <td className={td + ' whitespace-nowrap text-xs text-zinc-400'}>{new Date(r.capturedAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Métricas dos posts ────────────────────────────────────────

const COL_GROUPS: { key: keyof MetricsCols; label: string }[] = [
  { key: 'engagement', label: 'Engajamento' },
  { key: 'identification', label: 'Identificação' },
  { key: 'rate', label: 'Taxa de engajamento' },
  { key: 'delta', label: 'Variação vs anterior' },
];

function MetricsTab({
  rows, window, cols, setCols,
}: {
  rows: MediaMetricRow[];
  window: string;
  cols: MetricsCols;
  setCols: React.Dispatch<React.SetStateAction<MetricsCols>>;
}) {
  const prevByRow = new Map<string, MediaMetricRow | null>();
  const seen = new Map<string, MediaMetricRow>();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    prevByRow.set(r.id, seen.get(r.mediaId) ?? null);
    seen.set(r.mediaId, r);
  }
  const num = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR'));
  const rate = (r: MediaMetricRow) =>
    !r.reach || !r.totalInteractions ? '—' : ((r.totalInteractions / r.reach) * 100).toFixed(1) + '%';
  const delta = (r: MediaMetricRow) => {
    const prev = prevByRow.get(r.id);
    if (!prev || r.reach == null || prev.reach == null) return '—';
    const d = r.reach - prev.reach;
    if (d === 0) return '±0';
    return (d > 0 ? '+' : '') + d.toLocaleString('pt-BR');
  };
  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500';
  const td = 'px-3 py-2 text-sm tabular-nums text-zinc-700 dark:text-zinc-300';
  const engagementSeries = aggregateEngagementByDay(rows);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Cada linha é uma captura de métricas de um post. Período:{' '}
          <span className="font-medium">{WINDOW_LABELS[window] ?? window}</span>.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {COL_GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setCols((c) => ({ ...c, [g.key]: !c[g.key] }))}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                cols[g.key]
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {engagementSeries.length > 1 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
          <p className="mb-2 text-xs font-medium text-zinc-500">Alcance e interações por dia</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={engagementSeries} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-white/10" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" className="text-zinc-400" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-zinc-400" width={48} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="reach" name="Alcance" stroke="#8b5cf6" strokeWidth={2} fill="url(#reachGrad)" />
              <Area type="monotone" dataKey="interactions" name="Interações" stroke="#0047ff" strokeWidth={2} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-5 py-10 text-center dark:border-white/10 dark:bg-black">
          <p className="text-sm text-zinc-400">Nenhuma métrica capturada ainda. Peça pra crew analisar os posts.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
          <table className="w-full border-collapse">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03]">
              <tr>
                {cols.identification && <th className={th}>Post</th>}
                {cols.identification && <th className={th}>Capturado</th>}
                {cols.engagement && <th className={th}>Alcance</th>}
                {cols.engagement && <th className={th}>Curtidas</th>}
                {cols.engagement && <th className={th}>Coment.</th>}
                {cols.engagement && <th className={th}>Salvos</th>}
                {cols.engagement && <th className={th}>Compart.</th>}
                {cols.engagement && <th className={th}>Interações</th>}
                {cols.rate && <th className={th}>Taxa eng.</th>}
                {cols.delta && <th className={th}>Δ alcance</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                  {cols.identification && (
                    <td className={td + ' max-w-[220px]'}>
                      {(() => {
                        const label = r.caption
                          ? r.caption.replace(/\s+/g, ' ').trim().slice(0, 60) + (r.caption.length > 60 ? '…' : '')
                          : `Post ${r.mediaId.slice(-8)}`;
                        return r.permalink ? (
                          <a href={r.permalink} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline" title={r.caption ?? r.mediaId}>{label}</a>
                        ) : (
                          <span className="block truncate" title={r.caption ?? r.mediaId}>{label}</span>
                        );
                      })()}
                    </td>
                  )}
                  {cols.identification && (
                    <td className={td + ' whitespace-nowrap text-xs text-zinc-400'}>{new Date(r.capturedAt).toLocaleString('pt-BR')}</td>
                  )}
                  {cols.engagement && <td className={td}>{num(r.reach)}</td>}
                  {cols.engagement && <td className={td}>{num(r.likes)}</td>}
                  {cols.engagement && <td className={td}>{num(r.comments)}</td>}
                  {cols.engagement && <td className={td}>{num(r.saved)}</td>}
                  {cols.engagement && <td className={td}>{num(r.shares)}</td>}
                  {cols.engagement && <td className={td}>{num(r.totalInteractions)}</td>}
                  {cols.rate && <td className={td + ' font-medium'}>{rate(r)}</td>}
                  {cols.delta && (
                    <td className={td}>
                      <span className={delta(r).startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : delta(r).startsWith('-') ? 'text-red-600 dark:text-red-400' : 'text-zinc-400'}>
                        {delta(r)}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Atividade da crew ─────────────────────────────────────────

function ActivityView({ activity }: { activity: { analyses: any[]; activities: any[] } | undefined }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">Análises que os agentes gravaram e o histórico de ações. Atualiza sozinho.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Análises salvas ({activity?.analyses?.length ?? 0})
          </p>
          <div className="space-y-2">
            {(activity?.analyses ?? []).length === 0 ? (
              <p className="text-xs text-zinc-400">Nenhuma análise ainda.</p>
            ) : (
              activity!.analyses.map((a) => (
                <div key={a.id} className={`rounded-lg border border-l-4 border-zinc-100 px-3 py-2 dark:border-white/10 ${ANALYSIS_ACCENT[a.kind] ?? ANALYSIS_ACCENT.OUTRO}`}>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 ring-1 ring-black/5 dark:bg-white/10 dark:text-zinc-300">{a.kind}</span>
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{a.title}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs text-zinc-600 dark:text-zinc-400">{a.summary}</p>
                  {a.recommendations && (
                    <p className="mt-1 text-xs text-zinc-500"><span className="font-medium">Próximos passos:</span> {a.recommendations}</p>
                  )}
                  <p className="mt-1 text-[10px] text-zinc-400">{new Date(a.createdAt).toLocaleString('pt-BR')}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Log de ações ({activity?.activities?.length ?? 0})
          </p>
          <div className="space-y-1.5">
            {(activity?.activities ?? []).length === 0 ? (
              <p className="text-xs text-zinc-400">Nenhuma ação registrada ainda.</p>
            ) : (
              activity!.activities.map((ac) => (
                <div key={ac.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-black">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{ac.title || ac.action}</p>
                    <p className="text-[10px] text-zinc-400">{ac.action}{ac.channel ? ` · ${ac.channel}` : ''} · {new Date(ac.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    ac.status === 'OK'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                      : ac.status === 'FAILED'
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                  }`}>{ac.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
