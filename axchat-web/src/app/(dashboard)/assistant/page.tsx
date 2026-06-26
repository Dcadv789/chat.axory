'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserCircle,
  ListTodo,
  CheckCircle2,
  StickyNote,
  BellRing,
  CalendarDays,
  Send,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOrgId } from '@/hooks/use-org-query-key';
import { assistantService } from '@/features/assistant/services/assistant.service';
import { inboxService } from '@/features/inbox/services/inbox.service';

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

export default function AssistantPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();

  const { data: overview, isLoading } = useQuery({
    queryKey: ['assistant-overview', orgId],
    queryFn: () => assistantService.overview(),
    refetchInterval: 15000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['assistant-overview', orgId] });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando assistente…
      </div>
    );
  }

  if (!overview?.config) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <UserCircle className="h-10 w-10 text-zinc-300" />
        <p className="text-sm text-zinc-500">
          Seu assistente pessoal ainda não foi provisionado.
        </p>
      </div>
    );
  }

  const m = overview.metrics;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          <UserCircle className="h-5 w-5 text-primary" /> Assistente Pessoal
        </h1>
        <p className="text-xs text-zinc-500">
          Privado e só seu — tarefas, agenda, lembretes e anotações.
        </p>
      </header>

      <div className="flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_380px]">
          {/* Chat */}
          <div className="flex min-h-0 flex-col border-r border-zinc-200 dark:border-white/10">
            <AssistantChat conversationId={overview.conversationId} />
          </div>

          {/* Painel lateral */}
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Tarefas abertas" value={m.tasksOpen} icon={ListTodo} accent="#0047FF" />
              <Metric label="Concluídas" value={m.tasksDone} icon={CheckCircle2} accent="#16a34a" />
              <Metric label="Lembretes" value={m.remindersPending} icon={BellRing} accent="#d97706" />
              <Metric label="Compromissos" value={m.eventsUpcoming} icon={CalendarDays} accent="#7c3aed" />
            </div>

            <TasksPanel tasks={overview.tasks} onChange={invalidate} />
            <RemindersPanel reminders={overview.reminders} onChange={invalidate} />
            <EventsPanel events={overview.events} onChange={invalidate} />
            <NotesPanel onChange={invalidate} />
          </div>
        </div>
      </div>
    </div>
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

function AssistantChat({ conversationId }: { conversationId: string | null }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['assistant-messages', conversationId],
    queryFn: () => inboxService.getMessages(conversationId!),
    enabled: !!conversationId,
    refetchInterval: 4000,
  });
  const messages = data?.messages ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (t: string) =>
      inboxService.sendMessage({ conversationId: conversationId!, type: 'TEXT', content: { text: t } }),
    onSuccess: () => {
      setText('');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['assistant-messages', conversationId] }), 600);
    },
    onError: () => toast.error('Falha ao enviar.'),
  });

  if (!conversationId) {
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Conversa não disponível.</div>;
  }

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-zinc-400">
            Fale com seu assistente: "marca dentista quinta 15h e me lembra 30 min antes".
          </p>
        )}
        {messages.map((msg: any) => {
          const mine = msg.direction === 'INBOUND';
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                  mine
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-zinc-100 text-zinc-800 dark:bg-white/10 dark:text-zinc-100'
                }`}
              >
                {msg.content?.text ?? '—'}
                <span className={`mt-0.5 block text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-zinc-400'}`}>
                  {fmt(msg.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-zinc-200 p-3 dark:border-white/10">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) send.mutate(text.trim());
              }
            }}
            rows={1}
            placeholder="Escreva pro seu assistente…"
            className="max-h-32 flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
          <button
            onClick={() => text.trim() && send.mutate(text.trim())}
            disabled={send.isPending || !text.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ title, icon: Icon, children, action }: { title: string; icon: any; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Icon className="h-3.5 w-3.5" /> {title}
        </h3>
        {action}
      </div>
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
  const done = useMutation({
    mutationFn: (id: string) => assistantService.updateTask(id, { status: 'DONE' }),
    onSuccess: onChange,
  });
  const del = useMutation({
    mutationFn: (id: string) => assistantService.deleteTask(id),
    onSuccess: onChange,
  });
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
            <button onClick={() => done.mutate(t.id)} title="Concluir" className="text-zinc-400 hover:text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200">
              {t.title}
              {t.dueAt && <span className="ml-1 text-[10px] text-amber-600">· {fmt(t.dueAt)}</span>}
            </span>
            <button onClick={() => del.mutate(t.id)} className="text-zinc-300 opacity-0 hover:text-rose-600 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RemindersPanel({ reminders, onChange }: { reminders: any[]; onChange: () => void }) {
  const cancel = useMutation({
    mutationFn: (id: string) => assistantService.cancelReminder(id),
    onSuccess: onChange,
  });
  return (
    <Section title="Lembretes" icon={BellRing}>
      <ul className="space-y-1">
        {reminders.length === 0 && <li className="text-xs text-zinc-400">Nenhum lembrete pendente.</li>}
        {reminders.map((r) => (
          <li key={r.id} className="group flex items-center gap-2 text-sm">
            <BellRing className="h-3.5 w-3.5 text-amber-500" />
            <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{r.message}</span>
            <span className="text-[10px] text-zinc-400">{fmt(r.remindAt)}</span>
            <button onClick={() => cancel.mutate(r.id)} className="text-zinc-300 opacity-0 hover:text-rose-600 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function EventsPanel({ events, onChange }: { events: any[]; onChange: () => void }) {
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
  const { data: notes } = useQuery({
    queryKey: ['assistant-notes', orgId],
    queryFn: () => assistantService.listNotes(),
  });
  const qc = useQueryClient();
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
            <button onClick={() => del.mutate(n.id)} className="text-zinc-300 opacity-0 hover:text-rose-600 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
