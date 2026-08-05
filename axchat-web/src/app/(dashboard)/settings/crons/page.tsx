'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Play, Plus, Trash2, Power, Bot, CalendarClock, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
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

/** Traduz uma expressão cron (5 campos) para um texto legível em pt-BR. */
function describeCron(expr: string): string {
  const parts = (expr ?? '').trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;
  const pad = (s: string) => s.padStart(2, '0');
  const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  if (min.startsWith('*/') && hour === '*') return `a cada ${min.slice(2)} min`;
  if (min === '0' && hour === '*') return 'a cada hora';
  if (hour.startsWith('*/')) return `a cada ${hour.slice(2)}h`;

  const time = min !== '*' && hour !== '*' ? `${pad(hour)}:${pad(min)}` : null;
  if (time) {
    if (dow !== '*' && dom === '*' && mon === '*') {
      const d = days[Number(dow) % 7] ?? `dia ${dow}`;
      return `toda ${d} às ${time}`;
    }
    if (dom !== '*' && dow === '*') return `dia ${dom} de cada mês às ${time}`;
    if (dom === '*' && dow === '*') return `todo dia às ${time}`;
  }
  return expr;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'Concluído', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  FAILED: { label: 'Falhou', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400' },
  SKIPPED: { label: 'Pulado', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  RUNNING: { label: 'Rodando', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-zinc-400">nunca rodou</span>;
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400' };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
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
    onSuccess: () => toast.success('Disparo enfileirado — roda em segundos.'),
    onError: () => toast.error('Falha ao disparar.'),
  });

  const toggle = useMutation({
    mutationFn: (c: AgentCron) => cronsService.update(c.id, { isActive: !c.isActive }),
    onSuccess: () => { invalidate(); toast.success('Atualizado.'); },
    onError: () => toast.error('Falha ao atualizar.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => cronsService.remove(id),
    onSuccess: () => { invalidate(); toast.success('Cron removido.'); },
    onError: () => toast.error('Falha ao remover.'),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
        {/* Cabeçalho do card geral: título + botão Novo cron ao lado */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3.5 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 shrink-0 text-primary" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Crons agendados</h2>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Novo cron
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
              ))}
            </div>
          ) : crons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center dark:border-white/10 dark:bg-white/5">
              <Clock className="mx-auto h-9 w-9 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm text-zinc-500">Nenhum cron ainda.</p>
              <p className="mt-1 text-xs text-zinc-400">Crie o primeiro para agendar um agente numa cadência.</p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {crons.map((c) => (
                <CronCard
                  key={c.id}
                  c={c}
                  onRun={() => runNow.mutate(c.id)}
                  onToggle={() => toggle.mutate(c)}
                  onRemove={() => { if (confirm(`Excluir o cron "${c.name}"?`)) remove.mutate(c.id); }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <CreateCronDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={invalidate} />
    </div>
  );
}

function CronCard({
  c, onRun, onToggle, onRemove,
}: {
  c: AgentCron;
  onRun: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{c.name}</span>
            {!c.isActive && (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                pausado
              </span>
            )}
            <StatusBadge status={c.lastStatus} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <Bot className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{c.agent?.name ?? '—'}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              {describeCron(c.cronExpression)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            title="Rodar agora"
            onClick={onRun}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-200/70 hover:text-primary dark:hover:bg-white/10"
          >
            <Play className="h-4 w-4" />
          </button>
          <button
            title={c.isActive ? 'Pausar' : 'Ativar'}
            onClick={onToggle}
            className={`rounded-md p-2 hover:bg-zinc-200/70 dark:hover:bg-white/10 ${c.isActive ? 'text-emerald-600' : 'text-zinc-400'}`}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            title="Excluir"
            onClick={onRemove}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-200/70 hover:text-rose-600 dark:hover:bg-white/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-3 inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? 'Ocultar detalhes' : 'Ver detalhes'}
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-t border-zinc-200 pt-2.5 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400">
          <p className="whitespace-pre-wrap">
            <span className="font-medium text-zinc-500 dark:text-zinc-500">Tarefa: </span>
            {c.task}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              <span className="font-medium text-zinc-500">Agenda: </span>
              <code className="font-mono">{c.cronExpression}</code> · {c.timezone}
            </span>
            <span><span className="font-medium text-zinc-500">Próximo: </span>{fmt(c.nextRunAt)}</span>
            <span><span className="font-medium text-zinc-500">Último: </span>{fmt(c.lastRunAt)}</span>
          </div>
          {c.lastError && (
            <p className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {c.lastError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
