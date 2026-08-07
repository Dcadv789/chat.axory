'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
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

/**
 * Moderação e desempenho do Threads: escolhe um post publicado e mostra as
 * respostas (responder, ocultar/reexibir) e os insights dele.
 *
 * Os endpoints já existiam no backend desde que o canal foi criado, mas nunca
 * tiveram tela — na prática ninguém conseguia ler nem moderar resposta do
 * Threads pelo AxChat.
 */
export function ThreadsPanel() {
  const [postSelecionado, setPostSelecionado] = useState<ThreadsPost | null>(null);

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

  const posts = postsData?.posts ?? [];

  return (
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
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => setPostSelecionado(post)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      ativo
                        ? 'border-primary bg-primary/5'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20'
                    }`}
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
