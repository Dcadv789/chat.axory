'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  BarChart3,
  MessageSquare,
  Loader2,
  Send,
} from 'lucide-react';
import { ThreadsIcon } from '@/components/icons/threads-icon';
import { toast } from 'sonner';
import {
  channelsService,
  type ThreadsPost,
  type ThreadsReply,
} from '@/features/channels/services/channels.service';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
} from 'recharts';

/**
 * Moderação e desempenho do Threads: escolhe um post publicado e mostra as
 * respostas (responder, ocultar/reexibir) e os insights dele.
 *
 * Os endpoints já existiam no backend desde que o canal foi criado, mas nunca
 * tiveram tela — na prática ninguém conseguia ler nem moderar resposta do
 * Threads pelo AxChat.
 */
export function ThreadsPanel() {
  const queryClient = useQueryClient();
  const [postSelecionado, setPostSelecionado] = useState<ThreadsPost | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ThreadsPost | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const { data: canais, isLoading: carregandoCanais } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelsService.list(),
  });

  const canalThreads = canais?.find((c) => c.type === 'THREADS' && c.isActive);

  const { data: postsData, isLoading: carregandoPosts } = useQuery({
    queryKey: ['threads-posts', canalThreads?.id],
    queryFn: () => channelsService.threadsPosts(canalThreads!.id),
    enabled: !!canalThreads?.id,
  });

  if (carregandoCanais) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!canalThreads) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center dark:border-white/10 dark:bg-black">
        <ThreadsIcon className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-700" />
        <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Nenhum canal do Threads conectado
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Conecte em Configurações → Canais → Novo Canal → Threads.
        </p>
      </div>
    );
  }

  /**
   * `threads_delete` é permissão separada e só entra no token na conexão. Canal
   * conectado antes dela existir não pode excluir — o backend recusa com uma
   * mensagem pedindo pra reconectar, e é ela que aparece aqui.
   */
  const podeExcluir = !!(canalThreads?.config?.scopes as string[] | undefined)
    ?.includes('threads_delete');

  const excluir = async () => {
    if (!paraExcluir || !canalThreads) return;
    setExcluindo(true);
    try {
      await channelsService.threadsDeletePost(canalThreads.id, paraExcluir.id);
      toast.success('Post excluído do Threads.');
      if (postSelecionado?.id === paraExcluir.id) setPostSelecionado(null);
      setParaExcluir(null);
      await queryClient.invalidateQueries({ queryKey: ['threads-posts'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha ao excluir o post');
    } finally {
      setExcluindo(false);
    }
  };

  const posts = postsData?.posts ?? [];

  return (
    <div className="space-y-3">
      <ResumoDoPerfil canalId={canalThreads.id} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <ThreadsIcon className="h-4 w-4" /> Seus posts
        </div>

        {carregandoPosts ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : posts.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Nenhum post publicado ainda.
          </p>
        ) : (
          <ul className="max-h-[520px] space-y-1.5 overflow-y-auto scrollbar-thin">
            {posts.map((post) => {
              const ativo = postSelecionado?.id === post.id;
              return (
                <li
                  key={post.id}
                  className={`flex items-start gap-1 rounded-lg border transition-colors ${
                    ativo
                      ? 'border-primary bg-primary/5'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPostSelecionado(post)}
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                  >
                    <p className="line-clamp-2 text-xs text-zinc-800 dark:text-zinc-200">
                      {post.text || <span className="italic text-zinc-400">Sem texto</span>}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-400">
                      {post.timestamp && (
                        <span>
                          {new Date(post.timestamp).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {post.media_type && <span>· {post.media_type}</span>}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setParaExcluir(post)}
                    disabled={!podeExcluir}
                    title={
                      podeExcluir
                        ? 'Excluir post do Threads'
                        : 'Reconecte o canal do Threads em Configurações → Canais para poder excluir'
                    }
                    className="mr-1 mt-1.5 shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400 dark:hover:bg-rose-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="min-w-0">
        {postSelecionado ? (
          <DetalhePost canalId={canalThreads.id} post={postSelecionado} />
        ) : (
          <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Escolha um post à esquerda pra ver respostas e desempenho.
          </div>
        )}
      </div>

      </div>

      <ConfirmDialog
        open={!!paraExcluir}
        title="Excluir post do Threads?"
        description={
          paraExcluir?.text?.trim()
            ? `"${paraExcluir.text.slice(0, 120)}" — o post sai do perfil e não tem como desfazer.`
            : 'O post sai do perfil e não tem como desfazer.'
        }
        confirmLabel="Excluir"
        loading={excluindo}
        variant="danger"
        onConfirm={excluir}
        onCancel={() => setParaExcluir(null)}
      />
    </div>
  );
}

/**
 * Retorno geral da conta no Threads, acima da lista de posts.
 *
 * A API já devolvia isso (`threads_insights` no nó da conta, sem mediaId), mas
 * a tela só sabia pedir métrica DE UM POST — então visualizações do perfil e
 * evolução de seguidores não apareciam em lugar nenhum.
 */
function ResumoDoPerfil({ canalId }: { canalId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['threads-insights-perfil', canalId],
    queryFn: () => channelsService.threadsInsights(canalId),
    retry: false,
  });

  const metricas = data?.insights ?? [];
  const achar = (nome: string) => metricas.find((m) => m.name === nome);

  /**
   * A Meta devolve duas formas: `total_value` (acumulado) e `values` (série
   * diária). Somar os dois do mesmo jeito daria número errado — seguidores é
   * saldo, não evento: o certo ali é o último ponto, não a soma dos dias.
   */
  const valor = (nome: string): number | null => {
    const m = achar(nome);
    if (!m) return null;
    if (m.total_value?.value != null) return m.total_value.value;
    const pontos = m.values ?? [];
    if (!pontos.length) return null;
    if (nome === 'followers_count') return pontos[pontos.length - 1]?.value ?? null;
    return pontos.reduce((soma, v) => soma + (v.value ?? 0), 0);
  };

  const serieViews = (achar('views')?.values ?? [])
    .filter((v) => v.end_time)
    .map((v) => ({
      dia: new Date(v.end_time as string).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
      valor: v.value ?? 0,
    }));

  const cartoes = [
    { nome: 'views', label: 'Visualizações' },
    { nome: 'likes', label: 'Curtidas' },
    { nome: 'replies', label: 'Respostas' },
    { nome: 'reposts', label: 'Reposts' },
    { nome: 'quotes', label: 'Citações' },
    { nome: 'followers_count', label: 'Seguidores' },
  ];

  if (isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        {(error as any)?.response?.data?.message ??
          'Não consegui carregar as métricas do perfil.'}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Retorno geral
          </h3>
          <p className="text-[11px] text-zinc-500">
            Desempenho da conta no Threads. Números do período que a Meta
            devolve por padrão.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cartoes.map((c) => {
          const v = valor(c.nome);
          return (
            <div
              key={c.nome}
              className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-white/5"
            >
              <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {isLoading ? (
                  <span className="inline-block h-6 w-10 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
                ) : v == null ? (
                  '—'
                ) : (
                  v.toLocaleString('pt-BR')
                )}
              </p>
              <p className="text-[11px] text-zinc-500">{c.label}</p>
            </div>
          );
        })}
      </div>

      {serieViews.length > 1 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium text-zinc-500">
            Visualizações por dia
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={serieViews} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="thViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <ChartTooltip
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
                labelFormatter={(l) => `Dia ${l}`}
                formatter={(v) => [Number(v ?? 0).toLocaleString('pt-BR'), 'Visualizações']}
              />
              <Area
                type="monotone"
                dataKey="valor"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#thViews)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* A Meta só libera demografia com 100+ seguidores; dizer isso evita a
          leitura de que a tela está quebrada. */}
      <p className="mt-2 text-[10px] text-zinc-400">
        Demografia dos seguidores (país, cidade, idade) só é liberada pela Meta a
        partir de 100 seguidores.
      </p>
    </div>
  );
}

function DetalhePost({ canalId, post }: { canalId: string; post: ThreadsPost }) {
  const queryClient = useQueryClient();
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const { data: respostasData, isLoading: carregandoRespostas } = useQuery({
    queryKey: ['threads-replies', canalId, post.id],
    queryFn: () => channelsService.threadsReplies(canalId, post.id),
  });

  const { data: insightsData, isLoading: carregandoInsights } = useQuery({
    queryKey: ['threads-insights', canalId, post.id],
    queryFn: () => channelsService.threadsInsights(canalId, post.id),
  });

  const respostas = respostasData?.replies ?? [];
  const insights = insightsData?.insights ?? [];

  const recarregarRespostas = () =>
    queryClient.invalidateQueries({
      queryKey: ['threads-replies', canalId, post.id],
    });

  async function ocultar(resposta: ThreadsReply) {
    const ocultando = resposta.hide_status !== 'HIDDEN';
    try {
      await channelsService.threadsHideReply(canalId, resposta.id, ocultando);
      toast.success(ocultando ? 'Resposta ocultada.' : 'Resposta reexibida.');
      await recarregarRespostas();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? 'Não foi possível moderar a resposta.',
      );
    }
  }

  async function responder(replyToId: string) {
    const conteudo = texto.trim();
    if (!conteudo) return;
    setEnviando(true);
    try {
      await channelsService.threadsReply(canalId, replyToId, conteudo);
      toast.success('Resposta publicada.');
      setRespondendo(null);
      setTexto('');
      await recarregarRespostas();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? 'Não foi possível responder.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-zinc-800 dark:text-zinc-200">
            {post.text || <span className="italic text-zinc-400">Sem texto</span>}
          </p>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-zinc-400 hover:text-primary"
              title="Abrir no Threads"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 text-xs font-medium text-zinc-500 dark:border-white/5">
          <BarChart3 className="h-3.5 w-3.5" /> Desempenho
        </div>
        {carregandoInsights ? (
          <Skeleton className="mt-2 h-12 w-full rounded-lg" />
        ) : insights.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-400">Sem métricas pra este post ainda.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-4">
            {insights.map((m) => {
              const valor = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
              return (
                <div key={m.name}>
                  <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    {valor.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                    {m.title || m.name}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <MessageSquare className="h-4 w-4" /> Respostas
          {respostas.length > 0 && (
            <span className="text-xs font-normal text-zinc-400">({respostas.length})</span>
          )}
        </div>

        {carregandoRespostas ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : respostas.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Nenhuma resposta neste post.
          </p>
        ) : (
          <ul className="space-y-2">
            {respostas.map((r) => {
              const oculta = r.hide_status === 'HIDDEN';
              return (
                <li
                  key={r.id}
                  className={`rounded-lg border px-3 py-2 ${
                    oculta
                      ? 'border-zinc-200 bg-zinc-50 opacity-60 dark:border-white/10 dark:bg-white/5'
                      : 'border-zinc-200 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        @{r.username ?? 'desconhecido'}
                        {oculta && (
                          <span className="ml-1.5 font-normal text-zinc-400">· oculta</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-800 dark:text-zinc-200">
                        {r.text}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setRespondendo(respondendo === r.id ? null : r.id)
                        }
                        title="Responder"
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-primary dark:hover:bg-white/5"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => ocultar(r)}
                        title={oculta ? 'Reexibir' : 'Ocultar'}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                      >
                        {oculta ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {respondendo === r.id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        autoFocus
                        rows={2}
                        value={texto}
                        maxLength={500}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder="Sua resposta…"
                        className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-zinc-50"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRespondendo(null);
                            setTexto('');
                          }}
                          className="rounded-lg px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => responder(r.id)}
                          disabled={enviando || !texto.trim()}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                        >
                          {enviando && <Loader2 className="h-3 w-3 animate-spin" />}
                          Responder
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
