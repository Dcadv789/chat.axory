'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Activity, BarChart3, Loader2, Play, Pause, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  marketingService,
  type MediaMetricRow,
  type AdMetricRow,
  type AdCampaign,
} from '@/features/marketing/services/marketing.service';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Tab = 'gestao' | 'admetrics' | 'metrics' | 'activity';

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

export function MarketingPanel() {
  const [tab, setTab] = useState<Tab>('gestao');
  const [cols, setCols] = useState<MetricsCols>({
    engagement: true,
    identification: true,
    rate: true,
    delta: true,
  });

  const { data: mediaMetrics } = useQuery({
    queryKey: ['marketing-media-metrics'],
    queryFn: () => marketingService.mediaMetrics(),
    enabled: tab === 'metrics',
    refetchInterval: 30000,
  });
  const { data: adMetrics } = useQuery({
    queryKey: ['marketing-ad-metrics'],
    queryFn: () => marketingService.adMetrics(),
    enabled: tab === 'admetrics',
    refetchInterval: 30000,
  });
  const { data: activity } = useQuery({
    queryKey: ['marketing-activity'],
    queryFn: () => marketingService.activity(),
    enabled: tab === 'activity',
    refetchInterval: 30000,
  });

  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
        tab === id
          ? 'border-primary text-primary'
          : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          <Megaphone className="h-5 w-5 text-primary" />
          Marketing
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Gerencie seus anúncios, acompanhe as métricas de posts e campanhas e veja
          o que a crew de IA está fazendo. As regras da crew ficam em Configurações → Marketing.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 dark:border-white/10">
        {tabBtn('gestao', <Megaphone className="h-4 w-4" />, 'Gestão de anúncios')}
        {tabBtn('admetrics', <BarChart3 className="h-4 w-4" />, 'Métricas dos anúncios')}
        {tabBtn('metrics', <BarChart3 className="h-4 w-4" />, 'Métricas dos posts')}
        {tabBtn('activity', <Activity className="h-4 w-4" />, 'Atividade da crew')}
      </div>

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
  );
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

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando campanhas…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {(error as any)?.response?.data?.message ?? 'Erro ao carregar campanhas. Verifique as credenciais do Meta Ads em Integrações.'}
        </div>
      ) : (data?.campaigns.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-5 py-10 text-center dark:border-white/10">
          <p className="text-sm text-zinc-400">Nenhuma campanha na conta de anúncios.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10">
          <table className="w-full border-collapse">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
              <tr>
                <th className={th}>Campanha</th>
                <th className={th}>Status</th>
                <th className={th}>Orçamento/dia</th>
                <th className={th + ' text-right'}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data!.campaigns.map((c) => {
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

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Uma linha por campanha (captura diária). Período:{' '}
        <span className="font-medium">{WINDOW_LABELS[window] ?? window}</span>. A janela é ajustada em Configurações → Marketing.
      </p>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-5 py-10 text-center dark:border-white/10">
          <p className="text-sm text-zinc-400">Nenhuma métrica de anúncio ainda. Peça pra crew o "panorama dos anúncios".</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10">
          <table className="w-full border-collapse">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
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
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-5 py-10 text-center dark:border-white/10">
          <p className="text-sm text-zinc-400">Nenhuma métrica capturada ainda. Peça pra crew analisar os posts.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10">
          <table className="w-full border-collapse">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
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
                <div key={ac.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-1.5 dark:border-white/10">
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
