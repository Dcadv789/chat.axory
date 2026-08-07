'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Images,
  Instagram,
  Loader2,
  Play,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  marketingService,
  type ScheduledPost,
  type ScheduledPostStatus,
} from '../services/marketing.service';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const STATUS_META: Record<
  ScheduledPostStatus,
  { label: string; chip: string; ponto: string }
> = {
  PENDING: {
    label: 'Agendado',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    ponto: 'bg-blue-500',
  },
  PUBLISHING: {
    label: 'Publicando',
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
    ponto: 'bg-violet-500',
  },
  PUBLISHED: {
    label: 'Publicado',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    ponto: 'bg-emerald-500',
  },
  FAILED: {
    label: 'Falhou',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
    ponto: 'bg-rose-500',
  },
  CANCELED: {
    label: 'Cancelado',
    chip: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400',
    ponto: 'bg-zinc-400',
  },
};

const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const chaveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Calendário dos posts agendados, mês a mês.
 *
 * Mostra os cinco estados (agendado, publicando, publicado, falhou, cancelado)
 * porque o calendário também é o lugar onde se descobre que um post NÃO saiu —
 * um agendamento que falhou em silêncio é pior do que não ter agendamento.
 *
 * `onEscolherDia` devolve a data clicada pro formulário ao lado já abrir com
 * ela preenchida.
 */
export function CalendarioPosts({
  onEscolherDia,
}: {
  onEscolherDia?: (dia: Date) => void;
}) {
  const qc = useQueryClient();
  const hoje = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(hoje.getFullYear(), hoje.getMonth(), 1),
  );
  const [diaAberto, setDiaAberto] = useState<Date | null>(null);

  // Busca a grade inteira, não só o mês: as bordas mostram dias do mês vizinho
  // e um agendamento neles precisa aparecer.
  const { inicioGrade, fimGrade, dias } = useMemo(() => {
    const primeiro = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const inicio = new Date(primeiro);
    inicio.setDate(primeiro.getDate() - primeiro.getDay());
    const total = 42; // 6 semanas: o mês nunca "pula" de altura ao navegar
    const lista = Array.from({ length: total }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      return d;
    });
    const fim = new Date(lista[lista.length - 1]);
    fim.setHours(23, 59, 59, 999);
    return { inicioGrade: inicio, fimGrade: fim, dias: lista };
  }, [cursor]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['marketing-schedule', chaveDia(inicioGrade)],
    queryFn: () =>
      marketingService.listarAgendamentos(
        inicioGrade.toISOString(),
        fimGrade.toISOString(),
      ),
    refetchInterval: 60000,
    retry: false,
  });

  const porDia = useMemo(() => {
    const mapa = new Map<string, ScheduledPost[]>();
    for (const p of data?.posts ?? []) {
      const k = chaveDia(new Date(p.scheduledFor));
      const atual = mapa.get(k);
      if (atual) atual.push(p);
      else mapa.set(k, [p]);
    }
    return mapa;
  }, [data]);

  const cancelar = useMutation({
    mutationFn: (id: string) => marketingService.cancelarAgendamento(id),
    onSuccess: () => {
      toast.success('Agendamento cancelado.');
      qc.invalidateQueries({ queryKey: ['marketing-schedule'] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message ?? 'Falha ao cancelar'),
  });

  const remover = useMutation({
    mutationFn: (id: string) => marketingService.removerAgendamento(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-schedule'] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message ?? 'Falha ao remover'),
  });

  const irPara = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  const totalMes = (data?.posts ?? []).filter(
    (p) => new Date(p.scheduledFor).getMonth() === cursor.getMonth(),
  ).length;

  const postsDoDia = diaAberto ? (porDia.get(chaveDia(diaAberto)) ?? []) : [];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Calendário de posts
          </h3>
          <p className="text-xs text-zinc-500">
            {isLoading
              ? 'carregando…'
              : isError
                ? // Distingue "não tem nada" de "não consegui ler" — os dois
                  // pintariam o calendário vazio, e só um deles é normal.
                  ((error as any)?.response?.status === 404
                    ? 'Agendamento ainda não disponível nesta API'
                    : 'Não consegui carregar os agendamentos')
                : totalMes === 0
                  ? 'Nada agendado neste mês'
                  : `${totalMes} post(s) neste mês`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => irPara(-1)}
            aria-label="Mês anterior"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[130px] text-center text-sm font-medium capitalize text-zinc-800 dark:text-zinc-200">
            {cursor.toLocaleDateString('pt-BR', {
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <button
            onClick={() => irPara(1)}
            aria-label="Próximo mês"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              setCursor(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
            }
            className="ml-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            Hoje
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {DIAS.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const doMes = d.getMonth() === cursor.getMonth();
            const eHoje = mesmoDia(d, hoje);
            const posts = porDia.get(chaveDia(d)) ?? [];
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => {
                  setDiaAberto(d);
                  onEscolherDia?.(d);
                }}
                title={
                  posts.length
                    ? `${posts.length} post(s)`
                    : 'Agendar neste dia'
                }
                className={`flex h-[68px] flex-col items-stretch gap-1 rounded-md border p-1.5 text-left transition-colors ${
                  eHoje
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5'
                } ${doMes ? '' : 'opacity-40'}`}
              >
                <span
                  className={`text-[11px] font-medium tabular-nums ${
                    eHoje
                      ? 'text-primary'
                      : 'text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {d.getDate()}
                </span>
                <span className="flex min-h-0 flex-1 flex-wrap content-start gap-0.5">
                  {/* Até 4 pontos; o resto vira "+n" pra célula não crescer. */}
                  {posts.slice(0, 4).map((p) => (
                    <span
                      key={p.id}
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_META[p.status].ponto}`}
                    />
                  ))}
                  {posts.length > 4 && (
                    <span className="text-[9px] leading-none text-zinc-400">
                      +{posts.length - 4}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-100 pt-2 dark:border-white/5">
          {(
            ['PENDING', 'PUBLISHED', 'FAILED', 'CANCELED'] as ScheduledPostStatus[]
          ).map((st) => (
            <span
              key={st}
              className="inline-flex items-center gap-1 text-[10px] text-zinc-500"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[st].ponto}`} />
              {STATUS_META[st].label}
            </span>
          ))}
        </div>
      </div>

      {diaAberto && (
        <div className="border-t border-zinc-200 p-3 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              {diaAberto.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              })}
            </p>
            <button
              onClick={() => setDiaAberto(null)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
              aria-label="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {postsDoDia.length === 0 ? (
            <p className="py-2 text-xs text-zinc-400">
              Nada agendado. Preencha o post ao lado e clique em Agendar — a data
              já foi copiada pro formulário.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {postsDoDia.map((p) => {
                const meta = STATUS_META[p.status];
                const Icone = p.network === 'THREADS' ? AtSign : Instagram;
                return (
                  <li
                    key={p.id}
                    className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-2 dark:border-white/10 dark:bg-white/5"
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-200 text-zinc-400 dark:bg-white/10">
                        {p.carouselUrls.length > 0 ? (
                          <Images className="h-4 w-4" />
                        ) : p.videoUrl ? (
                          <Play className="h-4 w-4" />
                        ) : (
                          <Icone className="h-4 w-4" />
                        )}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-zinc-700 dark:text-zinc-200">
                          <Clock className="h-3 w-3 text-zinc-400" />
                          {hora(p.scheduledFor)}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.chip}`}
                        >
                          {meta.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400">
                          <Icone className="h-3 w-3" />
                          {p.network === 'THREADS' ? 'Threads' : 'Instagram'}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
                        {p.caption?.trim() || <em className="text-zinc-400">sem legenda</em>}
                      </p>
                      {p.status === 'FAILED' && p.lastError && (
                        <p className="mt-1 flex items-start gap-1 text-[10px] text-rose-600 dark:text-rose-400">
                          <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                          {p.lastError}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {p.status === 'PENDING' ? (
                        <button
                          onClick={() => cancelar.mutate(p.id)}
                          disabled={cancelar.isPending}
                          title="Cancelar agendamento"
                          className="rounded p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-900/20"
                        >
                          {cancelar.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : p.status !== 'PUBLISHING' ? (
                        <button
                          onClick={() => remover.mutate(p.id)}
                          disabled={remover.isPending}
                          title="Remover do calendário"
                          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
