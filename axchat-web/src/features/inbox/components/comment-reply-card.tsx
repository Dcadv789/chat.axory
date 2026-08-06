'use client';

import { useState } from 'react';
import { MessageSquare, Instagram, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { channelsService } from '@/features/channels/services/channels.service';
import type { CommentContext } from '../services/inbox.service';

/** A Meta corta comentários em 2200 caracteres. */
const LIMITE = 2200;

/**
 * Comentário do Instagram dentro do inbox, com resposta pública inline.
 *
 * Até aqui só a crew de marketing conseguia responder comentário (via skill do
 * agente) — um atendente humano via o comentário chegar e não tinha por onde
 * responder. Digitar na caixa normal manda DM, que é outra coisa: some do post
 * e não responde quem perguntou publicamente.
 */
export function CommentReplyCard({
  comment,
  channelId,
  isOutbound,
}: {
  comment: CommentContext;
  channelId: string;
  isOutbound: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [respondido, setRespondido] = useState(false);

  const moldura = `mb-1 overflow-hidden rounded-xl border ${
    isOutbound
      ? 'border-primary/40 bg-primary/10'
      : 'border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-black'
  }`;
  const corRotulo = isOutbound
    ? 'text-primary-foreground/80'
    : 'text-zinc-500 dark:text-zinc-400';

  async function responder() {
    const mensagem = texto.trim();
    if (!mensagem) return;

    setEnviando(true);
    try {
      await channelsService.instagramCommentReply(
        channelId,
        comment.commentId,
        mensagem,
      );
      setRespondido(true);
      setAberto(false);
      setTexto('');
      toast.success('Resposta publicada no comentário.');
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ??
          'Não foi possível responder o comentário.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={moldura}>
      <div
        className={`flex items-center gap-1.5 px-3 pt-2 text-[10px] uppercase tracking-wider ${corRotulo}`}
      >
        <Instagram className="h-3 w-3" />
        Comentou no seu post
        {comment.username && <span className="normal-case">· @{comment.username}</span>}
      </div>

      <div className="px-3 pb-2 pt-1.5">
        {respondido ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Respondido no Instagram
          </p>
        ) : aberto ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              rows={3}
              value={texto}
              maxLength={LIMITE}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Sua resposta pública ao comentário…"
              className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-950 outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-zinc-50"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-400">
                {texto.length}/{LIMITE}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAberto(false);
                    setTexto('');
                  }}
                  disabled={enviando}
                  className="rounded-lg px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-950 disabled:opacity-50 dark:hover:text-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={responder}
                  disabled={enviando || !texto.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {enviando && <Loader2 className="h-3 w-3 animate-spin" />}
                  Publicar resposta
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-primary hover:text-primary dark:border-white/10 dark:text-zinc-300"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Responder comentário
          </button>
        )}
      </div>
    </div>
  );
}
