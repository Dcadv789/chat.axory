'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, X, ChevronDown } from 'lucide-react';
import {
  notificationsSettingsService,
  type Notification,
} from '@/features/settings/services/notifications.service';

/**
 * Banner global de falhas de skill da IA (notificações AI_TOOL_FAILURE não
 * lidas). Expandível: mostra, por falha, a skill, o erro REAL e atalhos pra
 * abrir a conversa e ver a execução no setor certo.
 *
 * (Antes, "Ver execuções" mandava pra aba de execuções sem setor — e como ela
 * filtra por setor, falhas de Marketing/Meta Ads vinham vazias. Agora o detalhe
 * aparece aqui mesmo, sem depender daquela navegação.)
 */
function failureError(n: Notification): string {
  const d = (n.data ?? {}) as Record<string, any>;
  if (typeof d.errorMessage === 'string' && d.errorMessage) return d.errorMessage;
  const out = d.output;
  if (out && typeof out === 'object') {
    if (typeof out.error === 'string') return out.error;
    if (out.body) {
      return typeof out.body === 'string'
        ? out.body
        : JSON.stringify(out.body).slice(0, 300);
    }
    if (typeof out.status !== 'undefined') return `HTTP ${out.status}`;
  }
  return n.body;
}

function sectorSlug(n: Notification): string | null {
  const s = (n.data ?? {})?.sector;
  if (s === 'MARKETING') return 'marketing';
  if (s === 'ATENDIMENTO') return 'atendimento';
  return null;
}

export function ToolFailureBanner() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: notif } = useQuery({
    queryKey: ['notifications', 'tool-failures'],
    queryFn: async () => {
      const r = await notificationsSettingsService.list(1, 50);
      return r.notifications.filter(
        (n) => n.type === 'AI_TOOL_FAILURE' && !n.isRead,
      );
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = (notif ?? []).map((n) => n.id);
      await Promise.all(
        ids.map((id) => notificationsSettingsService.markRead(id)),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const count = notif?.length ?? 0;
  const headline = useMemo(() => {
    if (count === 0) return null;
    const last = notif![0];
    if (count === 1) return last.title;
    return `${count} skills falharam — última: ${last.title}`;
  }, [count, notif]);

  if (count === 0) return null;

  return (
    <div className="border-b border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20">
      <div className="flex items-center gap-3 px-6 py-2.5">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
        <div className="flex-1 text-sm text-red-800 dark:text-red-200">
          <span className="font-medium">{headline}</span>
          {notif && notif[0]?.body && (
            <span className="ml-2 text-red-700 dark:text-red-300">
              · {notif[0].body}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          {expanded ? 'Ocultar' : 'Ver detalhe'}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
          className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {markAll.isPending ? 'Marcando…' : 'Marcar como vistas'}
        </button>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          className="text-red-500 hover:text-red-700 dark:text-red-400"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="max-h-72 space-y-2 overflow-y-auto border-t border-red-200 px-6 py-3 dark:border-red-900/40">
          {(notif ?? []).slice(0, 12).map((n) => {
            const d = (n.data ?? {}) as Record<string, any>;
            const slug = sectorSlug(n);
            return (
              <div
                key={n.id}
                className="rounded-md border border-red-200 bg-white p-2.5 text-xs dark:border-red-900/40 dark:bg-red-950/40"
              >
                <div className="font-semibold text-red-800 dark:text-red-200">
                  {d.toolName ?? 'skill'}
                </div>
                <div className="mt-0.5 break-words text-red-700 dark:text-red-300">
                  {failureError(n)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {d.conversationId && (
                    <Link
                      href={`/inbox?conversationId=${d.conversationId}`}
                      className="font-medium text-red-700 underline hover:text-red-900 dark:text-red-300"
                    >
                      Abrir conversa
                    </Link>
                  )}
                  {slug && (
                    <Link
                      href={`/ai-agents?tab=runs&sector=${slug}`}
                      className="font-medium text-red-700 underline hover:text-red-900 dark:text-red-300"
                    >
                      Ver execução
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
