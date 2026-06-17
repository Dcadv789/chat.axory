'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Handshake,
  HeartHandshake,
  MessageCircle,
  Route,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  aiAgentsService,
  type Period,
} from '../../services/ai-agents.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { KpiCard } from './kpi-card';
import { PeriodSelector } from './period-selector';
import { BreakdownList } from './breakdown-list';
import { fmtNum } from './format';

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP_OFFICIAL: 'WhatsApp Oficial',
  WHATSAPP_ZAPPFY: 'WhatsApp Zappfy',
  INSTAGRAM: 'Instagram',
  TELEGRAM: 'Telegram',
};

export function JarvisMetricsTab() {
  const orgId = useOrgId();
  const [period, setPeriod] = useState<Period>('7d');

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['ai-business-metrics', orgId, period],
    queryFn: () => aiAgentsService.businessMetrics(period),
    refetchInterval: 30000,
  });

  const planPercent = metrics?.planUsage.percentUsed ?? null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Métricas Gerais
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Resultado do atendimento com IA no período selecionado.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Atendidas pela IA"
          value={isLoading ? '…' : fmtNum(metrics?.aiHandledConversations ?? 0)}
          hint={
            metrics
              ? `${fmtNum(metrics.totalAiInteractions)} atendimentos analisados`
              : undefined
          }
          icon={Sparkles}
          accent="#7c3aed"
        />
        <KpiCard
          label="Resolvidas sem humano"
          value={isLoading ? '…' : fmtPct(metrics?.resolutionWithoutHumanRate)}
          hint="Respostas ou encerramentos feitos pela IA."
          icon={CheckCircle2}
          accent="#16a34a"
        />
        <KpiCard
          label="Transferidas para humano"
          value={isLoading ? '…' : fmtPct(metrics?.transferToHumanRate)}
          hint="Quando a IA identificou que era melhor chamar a equipe."
          icon={Handshake}
          accent="#f97316"
        />
        <KpiCard
          label="Primeira resposta com IA"
          value={
            isLoading
              ? '…'
              : fmtMinutes(metrics?.averageFirstResponseMinutes.withAi ?? null)
          }
          hint={
            metrics
              ? `Sem IA: ${fmtMinutes(metrics.averageFirstResponseMinutes.withoutAi)}`
              : undefined
          }
          icon={Clock}
          accent="#2563eb"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <KpiCard
          label="Satisfação média"
          value={
            isLoading
              ? '…'
              : metrics?.satisfaction.averageScore != null
                ? `${metrics.satisfaction.averageScore.toFixed(1)} / 5`
                : '—'
          }
          hint={
            metrics
              ? `${fmtNum(metrics.satisfaction.responses)} avaliações de conversas com IA`
              : undefined
          }
          icon={Star}
          accent="#eab308"
        />
        <KpiCard
          label="Atenção manual"
          value={isLoading ? '…' : fmtNum(metrics?.manualAttentionConversations ?? 0)}
          hint="Conversas que precisaram de atenção manual."
          icon={HeartHandshake}
          accent="#dc2626"
        />
        <KpiCard
          label="Uso do plano"
          value={
            isLoading
              ? '…'
              : metrics?.planUsage.limit
                ? `${fmtNum(metrics.planUsage.used)} / ${fmtNum(metrics.planUsage.limit)}`
                : `${fmtNum(metrics?.planUsage.used ?? 0)} / ilimitado`
          }
          hint="Conversas atendidas pela IA no mês atual."
          icon={Route}
          accent={planAccent(planPercent)}
          trendPct={planPercent}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <BreakdownList
          title="Conversas por canal"
          items={(metrics?.conversationsByChannel ?? [])
            .sort((a, b) => b.count - a.count)
            .map((item) => ({
              label: CHANNEL_LABELS[item.channelType] ?? item.channelType,
              value: item.count,
            }))}
          unit="conversas"
          empty="Sem conversas no período."
        />

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Uso mensal do plano
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Acompanhe o volume de atendimentos com IA dentro do limite contratado.
              </p>
            </div>
            <MessageCircle className="h-4 w-4 text-zinc-400" />
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {fmtNum(metrics?.planUsage.used ?? 0)}
            </span>
            <span className="text-xs text-zinc-500">
              {metrics?.planUsage.limit
                ? `de ${fmtNum(metrics.planUsage.limit)} no mês`
                : 'limite ilimitado'}
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${planBarClass(planPercent)}`}
              style={{ width: `${Math.min(planPercent ?? 0, 100)}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            {planPercent == null
              ? 'Sem limite mensal configurado para esta organização.'
              : `${planPercent.toFixed(1)}% do limite mensal utilizado.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function fmtPct(value: number | null | undefined) {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function fmtMinutes(value: number | null) {
  if (value == null) return '—';
  if (value < 1) return '< 1 min';
  if (value < 60) return `${Math.round(value)} min`;
  return `${(value / 60).toFixed(1)} h`;
}

function planAccent(value: number | null) {
  if (value == null || value < 80) return '#16a34a';
  if (value < 95) return '#eab308';
  return '#dc2626';
}

function planBarClass(value: number | null) {
  if (value == null || value < 80) return 'bg-emerald-500';
  if (value < 95) return 'bg-amber-500';
  return 'bg-red-500';
}
