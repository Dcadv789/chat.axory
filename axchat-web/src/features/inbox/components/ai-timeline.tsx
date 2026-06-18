'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  ArrowRight,
  MessageSquare,
  UserRound,
  Loader2,
  Clock,
  AlertTriangle,
  GitBranch,
} from 'lucide-react';
import { aiAgentsService, type FeedRun } from '@/features/ai-agents/services/ai-agents.service';

interface AiTimelineProps {
  conversationId: string;
}

const ACTION_LABELS: Record<string, string> = {
  REPLIED: 'respondeu',
  DELEGATED: 'delegou para',
  TRANSFERRED: 'transferiu para',
  HANDED_BACK: 'devolveu',
  TAGGED: 'marcou',
  CLOSED_CONVERSATION: 'fechou conversa',
  ESCALATED: 'escalou',
};

/**
 * Processa a lista de runs e constrói uma sequência lógica de eventos
 * para exibição como timeline visual. Detecta delegações entre agentes
 * conectando runs consecutivas.
 */
function buildTimelineEvents(runs: FeedRun[]): TimelineEvent[] {
  const sorted = [...runs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );

  const events: TimelineEvent[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const run = sorted[i];
    const action = run.finalAction;
    const prevRun = i > 0 ? sorted[i - 1] : null;

    // Se o run anterior delegou e este run é de outro agente, conecta
    if (
      prevRun &&
      prevRun.finalAction === 'DELEGATED' &&
      prevRun.agent.id !== run.agent.id
    ) {
      events.push({
        type: 'delegation',
        fromAgent: prevRun.agent.name,
        toAgent: run.agent.name,
        timestamp: run.startedAt,
      });
    }

    // Se este run é o primeiro ou mudou de agente sem delegação explícita
    if (
      !prevRun ||
      (prevRun.agent.id !== run.agent.id && prevRun.finalAction !== 'DELEGATED')
    ) {
      // Só adiciona se não for continuação do mesmo agente
      if (!prevRun || prevRun.agent.id !== run.agent.id) {
        events.push({
          type: 'agent_enter',
          agentName: run.agent.name,
          agentId: run.agent.id,
          timestamp: run.startedAt,
        });
      }
    }

    events.push({
      type: 'action',
      action: action,
      agentName: run.agent.name,
      agentId: run.agent.id,
      timestamp: run.finishedAt || run.startedAt,
      status: run.status,
      errorMessage: run.errorMessage,
      durationMs: run.durationMs,
    });
  }

  return events;
}

type TimelineEvent =
  | {
      type: 'agent_enter';
      agentName: string;
      agentId: string;
      timestamp: string;
    }
  | {
      type: 'delegation';
      fromAgent: string;
      toAgent: string;
      timestamp: string;
    }
  | {
      type: 'action';
      action: string | null;
      agentName: string;
      agentId: string;
      timestamp: string;
      status: string;
      errorMessage: string | null;
      durationMs: number | null;
    };

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function AiTimeline({ conversationId }: AiTimelineProps) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['agent-runs', conversationId],
    queryFn: () =>
      aiAgentsService.feed({ conversationId, period: 'all', limit: 50 }),
    refetchInterval: 30000,
    staleTime: 5000,
  });

  const events = useMemo(() => buildTimelineEvents(runs), [runs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 pt-12 text-center">
        <GitBranch className="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Nenhuma atividade de IA nesta conversa
        </p>
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          O fluxo de agentes aparecerá aqui conforme eles executarem.
        </p>
      </div>
    );
  }

  return (
    <div className="relative px-4 py-3">
      {/* Vertical connector line */}
      <div className="absolute left-[17px] top-8 bottom-4 w-px bg-zinc-200 dark:bg-zinc-800" />

      <div className="space-y-0">
        {events.map((event, idx) => (
          <TimelineItem key={idx} event={event} isLast={idx === events.length - 1} />
        ))}
      </div>
    </div>
  );
}

function TimelineItem({
  event,
  isLast,
}: {
  event: TimelineEvent;
  isLast: boolean;
}) {
  switch (event.type) {
    case 'agent_enter':
      return (
        <div className="relative flex items-start gap-3 pb-4">
          <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/30">
            <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              {event.agentName}
            </p>
            <p className="text-[11px] text-zinc-400">
              começou a atender · {formatRelative(event.timestamp)}
            </p>
          </div>
        </div>
      );

    case 'delegation':
      return (
        <div className="relative flex items-start gap-3 pb-4">
          <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30">
            <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {event.fromAgent}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {event.toAgent}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              delegou · {formatRelative(event.timestamp)}
            </p>
          </div>
        </div>
      );

    case 'action':
      const isRunning = event.status === 'RUNNING';
      const failed = event.status === 'FAILED' || event.errorMessage != null;
      const actionLabel = event.action
        ? ACTION_LABELS[event.action] ?? event.action
        : 'processou';

      return (
        <div className="relative flex items-start gap-3 pb-4">
          <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-zinc-200 bg-white dark:border-zinc-700 dark:bg-black">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            ) : failed ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : (
              <MessageSquare className="h-4 w-4 text-emerald-500" />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {event.agentName}
              <span className="ml-1 font-normal text-zinc-500">
                {actionLabel}
              </span>
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
              <span>{formatRelative(event.timestamp)}</span>
              {event.durationMs != null && (
                <>
                  <span>·</span>
                  <Clock className="h-3 w-3" />
                  <span>{formatDuration(event.durationMs)}</span>
                </>
              )}
            </div>
            {event.errorMessage && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                {event.errorMessage}
              </p>
            )}
          </div>
        </div>
      );
  }
}
