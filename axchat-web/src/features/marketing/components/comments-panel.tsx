'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Instagram,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Send,
  Bot,
  Heart,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  marketingService,
  type InstagramPost,
  type InstagramComment,
} from '../services/marketing.service';
import { useMarketingAccount } from '../hooks/use-marketing-account';
import { Skeleton } from '@/components/ui/skeleton';

const LIMITE = 2200;

/**
 * Comentários por post: escolhe um post à esquerda, vê os comentários à
 * direita e responde ali mesmo.
 *
 * As respostas já publicadas aparecem aninhadas — é assim que se vê a
 * automação agindo: a resposta que ela publicou surge embaixo do comentário,
 * do mesmo jeito que uma resposta feita à mão.
 */
export function CommentsPanel() {
  const { channelId } = useMarketingAccount();
  const [postSelecionado, setPostSelecionado] = useState<InstagramPost | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['instagram-posts', channelId],
    queryFn: () => marketingService.instagramPosts(channelId),
  });

  const posts = data?.posts ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          <Instagram className="h-4 w-4" /> Seus posts
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Nenhum post encontrado nesta conta.
          </p>
        ) : (
          <ul className="max-h-[560px] space-y-1.5 overflow-y-auto scrollbar-thin">
            {posts.map((post) => {
              const ativo = postSelecionado?.id === post.id;
              return (
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => setPostSelecionado(post)}
                    className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      ativo
                        ? 'border-primary bg-primary/5'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20'
                    }`}
                  >
                    {post.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.thumbnailUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-11 w-11 shrink-0 rounded bg-zinc-100 dark:bg-white/5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs text-zinc-800 dark:text-zinc-200">
                        {post.caption || (
                          <span className="italic text-zinc-400">Sem legenda</span>
                        )}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-400">
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {post.comments ?? 0}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <Heart className="h-3 w-3" />
                          {post.likes ?? 0}
                        </span>
                        {post.timestamp && (
                          <span>
                            {new Date(post.timestamp).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
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
          <ListaComentarios post={postSelecionado} channelId={channelId} />
        ) : (
          <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Escolha um post à esquerda pra ver e responder os comentários.
          </div>
        )}
      </div>
    </div>
  );
}

function ListaComentarios({
  post,
  channelId,
}: {
  post: InstagramPost;
  channelId?: string;
}) {
  const queryClient = useQueryClient();
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<InstagramComment | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['instagram-comments', channelId, post.id],
    queryFn: () => marketingService.instagramComments(post.id, channelId),
    // A automação responde sozinha em segundo plano; sem refetch a tela
    // ficaria mostrando o comentário eternamente sem resposta.
    refetchInterval: 20000,
  });

  const comentarios = data?.comments ?? [];

  const recarregar = () =>
    queryClient.invalidateQueries({
      queryKey: ['instagram-comments', channelId, post.id],
    });

  async function responder(commentId: string) {
    const conteudo = texto.trim();
    if (!conteudo) return;
    setEnviando(true);
    try {
      await marketingService.replyInstagramComment(commentId, conteudo, channelId);
      toast.success('Resposta publicada no comentário.');
      setRespondendo(null);
      setTexto('');
      await recarregar();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? 'Não foi possível responder.',
      );
    } finally {
      setEnviando(false);
    }
  }

  async function ocultar(comentario: InstagramComment) {
    const ocultando = !comentario.hidden;
    try {
      await marketingService.hideInstagramComment(
        comentario.id,
        ocultando,
        channelId,
        // A cópia só importa ao ocultar — é ela que mantém o comentário na
        // tela depois que a Meta para de devolvê-lo.
        ocultando
          ? {
              mediaId: post.id,
              text: comentario.text,
              username: comentario.username,
              timestamp: comentario.timestamp,
              likes: comentario.likes,
            }
          : undefined,
      );
      toast.success(
        ocultando
          ? 'Comentário ocultado. Ele continua aqui, esmaecido — dá pra reexibir.'
          : 'Comentário reexibido no Instagram.',
      );
      await recarregar();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? 'Não foi possível moderar o comentário.',
      );
    }
  }

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await marketingService.deleteInstagramComment(paraExcluir.id, channelId);
      toast.success('Comentário excluído do Instagram.');
      setParaExcluir(null);
      await recarregar();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? 'Não foi possível excluir o comentário.',
      );
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-white/5">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {post.caption || 'Sem legenda'}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {comentarios.length} comentário(s) · atualiza sozinho a cada 20s
          </p>
        </div>
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-zinc-400 hover:text-primary"
            title="Abrir no Instagram"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : comentarios.length === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Nenhum comentário neste post ainda.
        </p>
      ) : (
        <ul className="max-h-[520px] space-y-2 overflow-y-auto scrollbar-thin">
          {comentarios.map((c) => (
            <li
              key={c.id}
              className={`rounded-lg border px-3 py-2.5 ${
                c.hidden
                  ? 'border-amber-300 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20'
                  : 'border-zinc-200 dark:border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    @{c.username ?? 'desconhecido'}
                    {c.hidden && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        oculto no Instagram
                      </span>
                    )}
                    {c.timestamp && (
                      <span className="ml-1.5 font-normal text-zinc-400">
                        {new Date(c.timestamp).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-800 dark:text-zinc-200">
                    {c.text}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setRespondendo(respondendo === c.id ? null : c.id)
                    }
                    title="Responder"
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-primary dark:hover:bg-white/5"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => ocultar(c)}
                    title={
                      c.hidden
                        ? 'Reexibir no Instagram'
                        : 'Ocultar no Instagram (dá pra desfazer)'
                    }
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                  >
                    {c.hidden ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setParaExcluir(c)}
                    title="Excluir do Instagram (não tem volta)"
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Respostas já publicadas — inclusive as da automação. */}
              {c.replies.length > 0 && (
                <ul className="mt-2 space-y-1.5 border-l-2 border-zinc-100 pl-3 dark:border-white/10">
                  {c.replies.map((r) => (
                    <li key={r.id}>
                      <p className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        <Bot className="h-3 w-3" />
                        @{r.username ?? 'você'}
                        {r.timestamp && (
                          <span className="font-normal text-zinc-400">
                            · {new Date(r.timestamp).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-700 dark:text-zinc-300">
                        {r.text}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {respondendo === c.id && (
                <div className="mt-2 space-y-2">
                  <textarea
                    autoFocus
                    rows={2}
                    value={texto}
                    maxLength={LIMITE}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={`Responder @${c.username ?? ''}…`}
                    className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-zinc-50"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">
                      {texto.length}/{LIMITE} · resposta pública
                    </span>
                    <div className="flex gap-2">
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
                        onClick={() => responder(c.id)}
                        disabled={enviando || !texto.trim()}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {enviando && <Loader2 className="h-3 w-3 animate-spin" />}
                        Publicar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!paraExcluir}
        title="Excluir comentário?"
        description={
          paraExcluir
            ? `"${paraExcluir.text ?? ''}" de @${paraExcluir.username ?? 'desconhecido'} some do Instagram para todo mundo, inclusive para quem escreveu. Não dá para desfazer — se quiser apenas tirar da vista, use "ocultar".`
            : ''
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onConfirm={excluir}
        onCancel={() => setParaExcluir(null)}
      />
    </div>
  );
}
