'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ListTodo,
  CheckCircle2,
  StickyNote,
  BellRing,
  CalendarDays,
  Plus,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';
import { useOrgId } from '@/hooks/use-org-query-key';
import { assistantService } from '@/features/assistant/services/assistant.service';

function fmt(dt: string | null): string {
  if (!dt) return '';
  try {
    return new Date(dt).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dt;
  }
}

/**
 * Painel lateral do Assistente Pessoal (tarefas/lembretes/agenda/notas +
 * métricas). Aparece no inbox SÓ quando a conversa aberta é o chat interno do
 * assistente. O chat em si é o próprio do inbox.
 */
export function AssistantPanel({ onClose }: { onClose?: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();

  const { data: overview, isLoading } = useQuery({
    queryKey: ['assistant-overview', orgId],
    queryFn: () => assistantService.overview(),
    refetchInterval: 15000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['assistant-overview', orgId] });

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Meu painel</h3>
        {onClose && (
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading || !overview ? (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Tarefas abertas" value={overview.metrics.tasksOpen} icon={ListTodo} accent="#0047FF" />
            <Metric label="Concluídas" value={overview.metrics.tasksDone} icon={CheckCircle2} accent="#16a34a" />
            <Metric label="Lembretes" value={overview.metrics.remindersPending} icon={BellRing} accent="#d97706" />
            <Metric label="Compromissos" value={overview.metrics.eventsUpcoming} icon={CalendarDays} accent="#7c3aed" />
          </div>
          <TasksPanel tasks={overview.tasks} onChange={invalidate} />
          <RemindersPanel reminders={overview.reminders} onChange={invalidate} />
          <EventsPanel events={overview.events} />
          <NotesPanel onChange={invalidate} />
        </div>
      )}
    </aside>
  );
}

function Metric({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-black">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1a`, color: accent }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h3>
      {children}
    </div>
  );
}

function TasksPanel({ tasks, onChange }: { tasks: any[]; onChange: () => void }) {
  const [adding, setAdding] = useState('');
  const create = useMutation({
    mutationFn: (title: string) => assistantService.createTask({ title }),
    onSuccess: () => { setAdding(''); onChange(); },
  });
  const done = useMutation({ mutationFn: (id: string) => assistantService.updateTask(id, { status: 'DONE' }), onSuccess: onChange });
  const del = useMutation({ mutationFn: (id: string) => assistantService.deleteTask(id), onSuccess: onChange });
  return (
    <Section title="Tarefas" icon={ListTodo}>
      <div className="mb-2 flex gap-1.5">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adding.trim() && create.mutate(adding.trim())}
          placeholder="Nova tarefa…"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-black"
        />
        <button onClick={() => adding.trim() && create.mutate(adding.trim())} className="rounded-md bg-primary px-2 text-primary-foreground"><Plus className="h-4 w-4" /></button>
      </div>
      <ul className="space-y-1">
        {tasks.length === 0 && <li className="text-xs text-zinc-400">Nenhuma tarefa aberta.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-white/5">
            <button onClick={() => done.mutate(t.id)} title="Concluir" className="text-zinc-400 hover:text-emerald-600"><CheckCircle2 className="h-4 w-4" /></button>
            <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200">
              {t.title}{t.dueAt && <span className="ml-1 text-[10px] text-amber-600">· {fmt(t.dueAt)}</span>}
            </span>
            <button onClick={() => del.mutate(t.id)} className="text-zinc-300 opacity-0 hover:text-rose-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RemindersPanel({ reminders, onChange }: { reminders: any[]; onChange: () => void }) {
  const cancel = useMutation({ mutationFn: (id: string) => assistantService.cancelReminder(id), onSuccess: onChange });
  return (
    <Section title="Lembretes" icon={BellRing}>
      <ul className="space-y-1">
        {reminders.length === 0 && <li className="text-xs text-zinc-400">Nenhum lembrete pendente.</li>}
        {reminders.map((r) => (
          <li key={r.id} className="group flex items-center gap-2 text-sm">
            <BellRing className="h-3.5 w-3.5 text-amber-500" />
            <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{r.message}</span>
            <span className="text-[10px] text-zinc-400">{fmt(r.remindAt)}</span>
            <button onClick={() => cancel.mutate(r.id)} className="text-zinc-300 opacity-0 hover:text-rose-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function EventsPanel({ events }: { events: any[] }) {
  return (
    <Section title="Agenda" icon={CalendarDays}>
      <ul className="space-y-1">
        {events.length === 0 && <li className="text-xs text-zinc-400">Sem compromissos próximos.</li>}
        {events.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-3.5 w-3.5 text-violet-500" />
            <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{e.title}</span>
            <span className="text-[10px] text-zinc-400">{fmt(e.startAt)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function NotesPanel({ onChange }: { onChange: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const { data: notes } = useQuery({
    queryKey: ['assistant-notes', orgId],
    queryFn: () => assistantService.listNotes(),
  });
  const [text, setText] = useState('');
  const create = useMutation({
    mutationFn: (content: string) => assistantService.createNote({ content }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['assistant-notes', orgId] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => assistantService.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistant-notes', orgId] }),
  });
  return (
    <Section title="Notas" icon={StickyNote}>
      <div className="mb-2 flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && text.trim() && create.mutate(text.trim())}
          placeholder="Anotação rápida…"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-black"
        />
        <button onClick={() => text.trim() && create.mutate(text.trim())} className="rounded-md bg-primary px-2 text-primary-foreground"><Plus className="h-4 w-4" /></button>
      </div>
      <ul className="space-y-1">
        {(notes ?? []).slice(0, 8).map((n: any) => (
          <li key={n.id} className="group flex items-start gap-2 text-sm">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="flex-1 text-zinc-700 dark:text-zinc-300">{n.content}</span>
            <button onClick={() => del.mutate(n.id)} className="text-zinc-300 opacity-0 hover:text-rose-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
