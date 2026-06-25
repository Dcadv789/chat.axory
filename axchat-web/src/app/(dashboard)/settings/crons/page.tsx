'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Play, Plus, Trash2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { cronsService, type AgentCron } from '@/features/crons/services/crons.service';
import { CreateCronDialog } from '@/features/crons/components/create-cron-dialog';

function fmt(dt: string | null): string {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dt;
  }
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-zinc-400">nunca rodou</span>;
  const map: Record<string, string> = {
    COMPLETED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
    FAILED: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
    SKIPPED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
    RUNNING: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  };
  const cls = map[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

export default function CronsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: crons = [], isLoading } = useQuery({
    queryKey: ['agent-crons'],
    queryFn: () => cronsService.list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agent-crons'] });

  const runNow = useMutation({
    mutationFn: (id: string) => cronsService.runNow(id),
    onSuccess: () => toast.success('Disparo enfileirado — rode em segundos.'),
    onError: () => toast.error('Falha ao disparar.'),
  });

  const toggle = useMutation({
    mutationFn: (c: AgentCron) => cronsService.update(c.id, { isActive: !c.isActive }),
    onSuccess: () => {
      invalidate();
      toast.success('Atualizado.');
    },
    onError: () => toast.error('Falha ao atualizar.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => cronsService.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Cron removido.');
    },
    onError: () => toast.error('Falha ao remover.'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">
            <Clock className="h-4 w-4 text-primary" />
            Crons de agente
          </h2>
          <p className="text-xs text-zinc-500">
            Dispare um agente numa cadência (ex: revisão mensal de mídia). O agente roda numa conversa interna e a saída fica visível no inbox.
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo cron
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-500">Carregando…</p>
      ) : crons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-white/10">
          <Clock className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-2 text-sm text-zinc-500">
            Nenhum cron ainda. Crie o primeiro para agendar um agente.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {crons.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.name}</span>
                    {!c.isActive && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-white/10">
                        pausado
                      </span>
                    )}
                    <StatusBadge status={c.lastStatus} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{c.task}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>🤖 {c.agent?.name ?? '—'}</span>
                    <span>
                      ⏱ <code className="font-mono">{c.cronExpression}</code>
                    </span>
                    <span>próximo: {fmt(c.nextRunAt)}</span>
                    <span>último: {fmt(c.lastRunAt)}</span>
                  </div>
                  {c.lastError && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">erro: {c.lastError}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    title="Rodar agora"
                    onClick={() => runNow.mutate(c.id)}
                    className="rounded p-2 text-zinc-500 hover:bg-zinc-100 hover:text-primary dark:hover:bg-white/5"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    title={c.isActive ? 'Pausar' : 'Ativar'}
                    onClick={() => toggle.mutate(c)}
                    className={`rounded p-2 hover:bg-zinc-100 dark:hover:bg-white/5 ${
                      c.isActive ? 'text-emerald-600' : 'text-zinc-400'
                    }`}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    title="Excluir"
                    onClick={() => {
                      if (confirm(`Excluir o cron "${c.name}"?`)) remove.mutate(c.id);
                    }}
                    className="rounded p-2 text-zinc-500 hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-white/5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateCronDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={invalidate} />
    </div>
  );
}
