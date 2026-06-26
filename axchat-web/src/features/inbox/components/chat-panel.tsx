'use client';

import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, Clock, AlertCircle, ExternalLink, Reply, Trash2, X, Ban, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { inboxService, type Conversation, type Message } from '../services/inbox.service';
import { ChatInput } from './chat-input';
import { quickRepliesService } from '@/features/settings/services/quick-replies.service';
import { getEngagementWindowStatus } from '../utils/inbox-errors';
import { ConversationHeader } from './conversation-header';
import { StoryReplyCard } from './story-reply-card';
import { AudioMessagePlayer } from './audio-message-player';
import {
  MediaImage,
  MediaVideo,
  MediaDocument,
  MediaSticker,
  MediaLocation,
} from './media-bubbles';
import { useSocket } from '../hooks/use-socket';
import { useAuthStore } from '@/stores/auth-store';
import { PendingActionsList } from '../pending-actions/pending-actions-list';
import { WhatsappTemplateSelector } from './whatsapp-template-selector';
import { MessageSearchBar } from './message-search-bar';
import type { WhatsappTemplate } from '@/features/channels/services/channels.service';

interface ChatPanelProps {
  conversation: Conversation;
  onConversationUpdate: () => void;
  /** Forwarded to ConversationHeader so the agent-runs sidebar toggle
   *  shows up in the chat header. */
  onToggleAgentLogs?: () => void;
  agentLogsOpen?: boolean;
  /** Forwarded to ConversationHeader so the contact sidebar toggle
   *  shows up in the chat header. */
  onToggleContactSidebar?: () => void;
  contactSidebarOpen?: boolean;
  /** Chat interno do Assistente Pessoal: inverte os lados (MINHAS mensagens à
   *  direita/azul, a IA à esquerda) e mostra a IA como quem fala comigo. */
  assistantMode?: boolean;
}

const statusIcons: Record<string, React.ElementType> = {
  QUEUED: Clock,
  SENT: Check,
  DELIVERED: CheckCheck,
  READ: CheckCheck,
  FAILED: AlertCircle,
};

/**
 * Banner de aviso quando a conversa está fora da "janela de atendimento"
 * do WhatsApp (24h sem mensagem do cliente). Sem template aprovado, qualquer
 * mensagem livre é rejeitada pelo provider com `failed_reason: Re-engagement
 * message`.
 *
 * Heurística client-side: olha as últimas mensagens já carregadas e procura
 * a última INBOUND. Se nenhuma encontrada nos buffer atual, OU se ela é mais
 * velha que 24h, mostra o banner. Não 100% preciso (paginação pode esconder
 * inbound antiga) mas resolve >95% dos casos sem precisar de campo novo no
 * backend.
 */
function EngagementWindowBanner({
  channelType,
  messages,
}: {
  channelType: string;
  messages: Message[];
}) {
  const { expired, ageLabel } = getEngagementWindowStatus(channelType, messages);
  if (!expired || !ageLabel) return null;

  return (
    <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1 leading-relaxed">
        <strong>Janela de 24h expirada</strong> — última mensagem do cliente
        foi há {ageLabel}. WhatsApp só aceita{' '}
        <strong>templates aprovados</strong> agora. Peça para o cliente uma
        nova mensagem, ou envie um template HSM via Meta Business.
      </div>
    </div>
  );
}

/**
 * Tooltip humano pra cada status. Especial pra FAILED com motivo conhecido
 * — operador entende que precisa de template em vez de relê o erro do
 * provider em inglês ("Re-engagement message").
 */
function statusTooltip(status: string, failedReason?: string | null): string {
  switch (status) {
    case 'QUEUED':
      return 'Enviando…';
    case 'SENT':
      return 'Enviado pro provedor';
    case 'DELIVERED':
      return 'Entregue ao destinatário';
    case 'READ':
      return 'Lida';
    case 'FAILED':
      if (failedReason && /re-?engagement/i.test(failedReason)) {
        return 'Falhou: cliente sem mensagem há mais de 24h. Use um template aprovado pra reabrir a conversa.';
      }
      if (failedReason) return `Falhou: ${failedReason}`;
      return 'Falhou ao enviar';
    default:
      return status;
  }
}

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const IG_CDN_HOSTS = /(lookaside\.fbsbx\.com|cdninstagram\.com|fbcdn\.net)/i;

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function LinkPreviewCard({ url, isOutbound }: { url: string; isOutbound: boolean }) {
  const [imgOk, setImgOk] = useState(IG_CDN_HOSTS.test(url));
  const host = safeHostname(url);

  if (imgOk) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt="Mídia compartilhada"
          className="max-h-64 rounded-lg bg-zinc-100 object-cover dark:bg-black"
          onError={() => setImgOk(false)}
        />
        <span
          className={`mt-1 block text-[10px] ${
            isOutbound ? 'opacity-80' : 'text-zinc-400'
          }`}
        >
          {host}
        </span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
        isOutbound
          ? 'border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/15'
          : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-white/10 dark:bg-black dark:hover:bg-white/10'
      }`}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className="truncate font-medium">{host}</span>
    </a>
  );
}

function matchSingleUrl(text: string): string | null {
  const trimmed = text.trim();
  const m = trimmed.match(/^(https?:\/\/\S+)$/i);
  return m ? m[1] : null;
}

function renderInlineTextWithLinks(text: string, isOutbound: boolean) {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 wrap-break-word ${
            isOutbound ? 'text-primary-foreground' : 'text-primary'
          }`}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function MessageText({
  text,
  isOutbound,
  className = '',
}: {
  text: string;
  isOutbound: boolean;
  className?: string;
}) {
  const onlyUrl = matchSingleUrl(text);
  if (onlyUrl) {
    return <LinkPreviewCard url={onlyUrl} isOutbound={isOutbound} />;
  }
  return (
    <p className={`whitespace-pre-wrap wrap-break-word text-sm ${className}`}>
      {renderInlineTextWithLinks(text, isOutbound)}
    </p>
  );
}

interface TemplateButtonShape {
  type?: string;
  title?: string;
  url?: string;
  payload?: string;
}

interface TemplateElementShape {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  defaultActionUrl?: string;
  buttons?: TemplateButtonShape[];
}

function TemplateButtonRow({
  buttons,
  isOutbound,
}: {
  buttons: TemplateButtonShape[];
  isOutbound: boolean;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      {buttons.map((btn, i) => {
        const label = btn.title || btn.url || btn.payload || 'Botão';
        const baseClass = `block rounded-md border px-3 py-1.5 text-center text-xs font-medium transition-colors ${
          isOutbound
            ? 'border-primary-foreground/30 bg-primary-foreground/10 hover:bg-primary-foreground/20'
            : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:bg-black dark:text-zinc-200 dark:hover:bg-white/10'
        }`;
        if (btn.url) {
          return (
            <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer" className={baseClass}>
              {label}
            </a>
          );
        }
        return (
          <span
            key={i}
            className={`${baseClass} cursor-default opacity-80`}
            title={btn.payload || btn.type || ''}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function TemplateMessage({
  content,
  isOutbound,
}: {
  content: Record<string, any>;
  isOutbound: boolean;
}) {
  const tpl = (content?.template ?? {}) as {
    templateType?: string;
    text?: string;
    buttons?: TemplateButtonShape[];
    elements?: TemplateElementShape[];
  };
  const headerText = tpl.text || content?.text;
  const elements = tpl.elements ?? [];
  const buttons = tpl.buttons ?? [];

  return (
    <div className="space-y-2">
      {headerText && <MessageText text={headerText} isOutbound={isOutbound} />}

      {elements.map((el, i) => (
        <div
          key={i}
          className={`overflow-hidden rounded-lg border ${
            isOutbound
              ? 'border-primary-foreground/20 bg-primary-foreground/5'
              : 'border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-black'
          }`}
        >
          {el.imageUrl && (
            <a
              href={el.defaultActionUrl || el.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={el.imageUrl}
                alt={el.title || 'Template'}
                className="max-h-48 w-full object-cover"
              />
            </a>
          )}
          {(el.title || el.subtitle) && (
            <div className="px-3 py-2">
              {el.title && <p className="text-sm font-medium">{el.title}</p>}
              {el.subtitle && (
                <p className="mt-0.5 text-xs opacity-75">{el.subtitle}</p>
              )}
            </div>
          )}
          {el.buttons && el.buttons.length > 0 && (
            <div className="px-3 pb-2">
              <TemplateButtonRow buttons={el.buttons} isOutbound={isOutbound} />
            </div>
          )}
        </div>
      ))}

      {buttons.length > 0 && <TemplateButtonRow buttons={buttons} isOutbound={isOutbound} />}

      {!headerText && elements.length === 0 && buttons.length === 0 && (
        <p className="text-sm italic opacity-70">[Template]</p>
      )}
    </div>
  );
}

function ContactAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '??').slice(0, 2).toUpperCase();
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-10 w-10 text-sm';
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'avatar'}
        onError={() => setFailed(true)}
        className={`${dim} shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-700`}
      />
    );
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400`}
    >
      {initials}
    </div>
  );
}

export function ChatPanel({
  conversation,
  onConversationUpdate,
  onToggleAgentLogs,
  agentLogsOpen,
  onToggleContactSidebar,
  contactSidebarOpen,
  assistantMode = false,
}: ChatPanelProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { on, emit, onReconnect } = useSocket();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['messages', conversation.id],
    queryFn: () => inboxService.getMessages(conversation.id),
    // Defenses against socket gaps: refetch when the tab regains focus
    // and on browser-level reconnect. Realtime is the happy path; these
    // catch the case where a `message:new` was missed.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 5000,
  });

  const messages = data?.messages || [];

  const { expired: engagementBlocked } = getEngagementWindowStatus(
    conversation.channel.type,
    messages,
  );

  const { data: quickReplies } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: () => quickRepliesService.list(),
    staleTime: 30000, // refetch at most every 30s
  });

  useEffect(() => {
    emit('join:conversation', { conversationId: conversation.id });
    return () => {
      emit('leave:conversation', { conversationId: conversation.id });
    };
  }, [conversation.id, emit]);

  // Merge de uma mensagem no cache da conversa. Usado tanto pelo socket
  // (message:new) quanto pela resposta do POST /messages — assim a mensagem
  // enviada aparece na hora mesmo se o websocket estiver caído. Dedup por
  // id/externalId garante que receber pelos dois caminhos não duplica.
  const mergeMessage = useCallback(
    (msg: Message) => {
      // Merge into the current cache. If there's no cache yet (initial
      // fetch still in flight, or cache evicted) we DON'T discard the
      // event — we invalidate so the refetch picks the new message up.
      const existingCache = queryClient.getQueryData<{ messages: Message[] }>([
        'messages',
        conversation.id,
      ]);
      if (!existingCache) {
        queryClient.invalidateQueries({
          queryKey: ['messages', conversation.id],
        });
        return;
      }
      queryClient.setQueryData<{ messages: Message[] }>(
        ['messages', conversation.id],
        (prev) => {
          if (!prev) return prev;
          const existing = prev.messages || [];
          // Dedup by id (authoritative) or by externalId when present.
          const match = existing.findIndex(
            (m) =>
              m.id === msg.id ||
              (msg.externalId && m.externalId && m.externalId === msg.externalId),
          );
          if (match !== -1) {
            const merged = [...existing];
            merged[match] = { ...existing[match], ...msg };
            return { ...prev, messages: merged };
          }
          return { ...prev, messages: [...existing, msg] };
        },
      );
    },
    [conversation.id, queryClient],
  );

  useEffect(() => {
    const unsubNew = on('message:new', (payload: any) => {
      const msg = payload.message;
      if (!msg) return;
      const convId = payload.conversationId ?? msg.conversationId;
      if (convId !== conversation.id) return;
      mergeMessage(msg);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    const unsubStatus = on('message:status', (payload: any) => {
      if (payload.conversationId !== conversation.id) return;
      const ids: string[] = payload.messageIds ?? (payload.messageId ? [payload.messageId] : []);
      if (ids.length === 0) return;
      queryClient.setQueryData<{ messages: Message[] } | undefined>(
        ['messages', conversation.id],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              ids.includes(m.id) ? { ...m, status: payload.status } : m,
            ),
          };
        },
      );
    });
    // Reconnect: any messages that arrived during the offline window are
    // gone from this client's perspective (socket misses events while
    // disconnected). Refetch the open conversation's messages on every
    // reconnect, plus the conversation list, so the user comes back to a
    // correct view without having to F5.
    const unsubReconnect = onReconnect(() => {
      queryClient.invalidateQueries({
        queryKey: ['messages', conversation.id],
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    // Watchdog/admin revogou uma mensagem — pinta a bolha como "deletada"
    // pra todo mundo que tá com a conversa aberta, sem refresh.
    const unsubRevoked = on('message:revoked', (payload: any) => {
      if (payload?.conversationId !== conversation.id) return;
      if (!payload?.messageId) return;
      queryClient.setQueryData<{ messages: Message[] } | undefined>(
        ['messages', conversation.id],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === payload.messageId
                ? {
                    ...m,
                    revokedAt: payload.revokedAt,
                    revokedBy: payload.revokedBy,
                    revokeSucceededRemote: payload.succeededRemote,
                  }
                : m,
            ),
          };
        },
      );
    });
    const unsubTyping = on('agent:typing', (payload: any) => {
      if (payload.conversationId !== conversation.id) return;
      if (payload.userId === user?.id) return;
      const userId = payload.userId as string;
      if (payload.isTyping) {
        setTypingUsers((prev) => new Set(prev).add(userId));
        const existing = typingTimersRef.current.get(userId);
        if (existing) clearTimeout(existing);
        typingTimersRef.current.set(
          userId,
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.delete(userId);
              return next;
            });
          }, 5000),
        );
      } else {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        const existing = typingTimersRef.current.get(userId);
        if (existing) clearTimeout(existing);
        typingTimersRef.current.delete(userId);
      }
    });
    return () => {
      unsubNew?.();
      unsubStatus?.();
      unsubReconnect?.();
      unsubRevoked?.();
      unsubTyping?.();
      for (const timer of typingTimersRef.current.values()) {
        clearTimeout(timer);
      }
      typingTimersRef.current.clear();
    };
  }, [conversation.id, on, onReconnect, queryClient, mergeMessage, user?.id]);

  const handleRevoke = useCallback(
    async (msg: Message) => {
      const ok = window.confirm(
        'Deletar essa mensagem pra todos? ' +
          'Em WhatsApp via Zappfy a mensagem some no app do cliente. ' +
          'Em WhatsApp Cloud API e Instagram, ela some apenas no AxChat ' +
          '(limitação da Meta — o cliente continua vendo no app dele).',
      );
      if (!ok) return;
      try {
        const result = await inboxService.revokeMessage(msg.id);
        if (result.succeededRemote) {
          toast.success('Mensagem deletada pra todos');
        } else {
          toast.warning(
            'Mensagem deletada só no AxChat. ' +
              'O cliente ainda vê a mensagem no app dele (limitação do canal).',
          );
        }
        // Otimista: marca local enquanto o realtime não chega
        queryClient.setQueryData<{ messages: Message[] } | undefined>(
          ['messages', conversation.id],
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === msg.id
                  ? {
                      ...m,
                      revokedAt: result.revokedAt,
                      revokedBy: result.revokedBy,
                      revokeSucceededRemote: result.succeededRemote,
                    }
                  : m,
              ),
            };
          },
        );
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message ||
            err?.message ||
            'Erro ao deletar mensagem',
        );
      }
    },
    [conversation.id, queryClient],
  );

  // Scroll ao fundo ao entrar na conversa (instantâneo) ou ao chegar
  // mensagem nova (suave). O instantâneo é essencial pra não parar no
  // meio do histórico quando o conteúdo ainda está renderizando.
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (!bottomRef.current) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      // Instantâneo na primeira carga — garante que vai até o final
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    } else {
      // Suave para mensagens novas
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Reply state — quando setado, próxima msg enviada vai com replyToMessageId
  // e a UI mostra a barra "respondendo a..." acima do input. Reseta ao
  // trocar de conversa (via key prop do ChatPanel) ou ao mandar a msg.
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleJumpToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary/40', 'rounded-lg');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary/40', 'rounded-lg');
      }, 2000);
    }
  }, []);

  const startReply = useCallback((message: Message) => {
    setReplyingTo(message);
  }, []);
  const cancelReply = useCallback(() => setReplyingTo(null), []);

  const handleSend = async (text: string) => {
    // Bloqueia envio de texto/mídia se janela 24h expirou
    if (engagementBlocked && !privateMode) {
      setTemplatePanelOpen(true);
      toast.warning(
        'Janela de 24h expirada. Só é permitido enviar templates aprovados pelo WhatsApp.',
      );
      return;
    }

    const replyToMessageId = replyingTo?.id;
    if (privateMode) {
      setReplyingTo(null);
    }
    try {
      // Insere a mensagem no cache com a resposta do POST — não dependemos
      // só do message:new via socket pra mostrar a própria mensagem (se o
      // socket estiver caído, ela apareceria só no próximo refetch).
      const sent = await inboxService.sendMessage({
        conversationId: conversation.id,
        type: privateMode ? 'INTERNAL_NOTE' : 'TEXT',
        content: { text },
        replyToMessageId: privateMode ? undefined : replyToMessageId,
      });
      if (sent?.id) mergeMessage(sent);
      setReplyingTo(null);
    } catch (err: any) {
      // Fallback: if send fails before the socket event arrives, force a refresh.
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      toast.error(
        err?.response?.data?.message || err?.message || 'Erro ao enviar mensagem',
      );
      throw err;
    }
  };

  const handleSendAudio = async (blob: Blob) => {
    if (engagementBlocked) {
      setTemplatePanelOpen(true);
      toast.warning('Janela de 24h expirada. Envie um template aprovado.');
      return;
    }
    try {
      const sent = await inboxService.sendAudioMessage(conversation.id, blob);
      if (sent?.id) mergeMessage(sent);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      throw err;
    }
  };

  const handleSendFile = async (file: File) => {
    if (engagementBlocked) {
      setTemplatePanelOpen(true);
      toast.warning('Janela de 24h expirada. Envie um template aprovado.');
      return;
    }
    try {
      const sent = await inboxService.sendMediaMessage(conversation.id, file);
      if (sent?.id) mergeMessage(sent);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      throw err;
    }
  };

  const handleSendTemplate = async (
    template: WhatsappTemplate,
    params: Record<string, string>,
  ) => {
    try {
      const sent = await inboxService.sendMessage({
        conversationId: conversation.id,
        type: 'WHATSAPP_TEMPLATE',
        content: {
          templateName: template.name,
          templateId: template.metaTemplateId,
          language: template.language,
          params: Object.values(params).filter(Boolean),
          components: template.components,
        },
      });
      if (sent?.id) mergeMessage(sent);
      setTemplatePanelOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao enviar template');
    }
  };

  // Hora embaixo de cada bolha. Se a msg não for de hoje, prefixa com
  // a data curta ("DD/MM 16:58") pra não precisar caçar o separador
  // rolando o histórico inteiro.
  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    const showYear = d.getFullYear() !== now.getFullYear();
    const datePart = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      ...(showYear ? { year: '2-digit' } : {}),
    });
    return `${datePart} ${time}`;
  };

  // Separador de data no estilo WhatsApp: agrupa mensagens por dia.
  // "Hoje" / "Ontem" / dia da semana (últimos 7 dias) / "25 de maio" /
  // "25/05/2024" quando o ano é diferente.
  const formatDateSeparator = (date: string) => {
    const d = new Date(date);
    const startOfDay = (x: Date) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const now = new Date();
    const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (dayDiff === 0) return 'Hoje';
    if (dayDiff === 1) return 'Ontem';
    if (dayDiff > 1 && dayDiff < 7) {
      const w = d.toLocaleDateString('pt-BR', { weekday: 'long' });
      return w.charAt(0).toUpperCase() + w.slice(1);
    }
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    }
    return d.toLocaleDateString('pt-BR');
  };

  return (
    // min-h-0 é load-bearing: sem ele, o scroll-container interno cresce
    // pelo conteúdo (default min-height de flex children) e empurra o
    // ChatInput pra fora do painel — quebra dramaticamente quando o pai
    // é um modal com altura fixa.
    <div className="flex min-h-0 flex-1 flex-col">
      <ConversationHeader
        conversation={conversation}
        onUpdate={onConversationUpdate}
        onToggleAgentLogs={onToggleAgentLogs}
        agentLogsOpen={agentLogsOpen}
        onToggleContactSidebar={onToggleContactSidebar}
        contactSidebarOpen={contactSidebarOpen}
      />

      <PendingActionsList conversationId={conversation.id} />

      <EngagementWindowBanner
        channelType={conversation.channel.type}
        messages={messages}
      />

      <MessageSearchBar messages={messages} onJumpToMessage={handleJumpToMessage} />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-4 dark:bg-[#171717]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            Nenhuma mensagem ainda
          </div>
        ) : (
          <div className="w-full space-y-2">
            {(() => {
              const reactionMap = new Map<string, string[]>();
              for (const msg of messages) {
                if (msg.type === 'REACTION' && msg.content?.reaction) {
                  const targetId = msg.content.reaction.targetMessageId;
                  if (targetId) {
                    const existing = reactionMap.get(targetId) || [];
                    existing.push(msg.content.reaction.emoji);
                    reactionMap.set(targetId, existing);
                  }
                }
              }
              const visibleMessages = messages.filter((m) => m.type !== 'REACTION');
              let lastDateKey = '';
              return visibleMessages.map((msg) => {
                // No chat interno do assistente, "eu" sou o dono (INBOUND), então
                // invertemos: minhas mensagens viram o lado destacado (direita/
                // azul) e as da IA viram o outro lado, como se ela falasse comigo.
                const isOutbound = assistantMode
                  ? msg.direction === 'INBOUND'
                  : msg.direction === 'OUTBOUND';
                const isPrivateNote = msg.type === 'INTERNAL_NOTE';
                const StatusIcon = statusIcons[msg.status] || Clock;
                const reactions = reactionMap.get(msg.externalId || '') || [];
                const isRevoked = !!msg.revokedAt;
                const msgDate = new Date(msg.createdAt);
                const dateKey = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;
                const showDateSeparator = dateKey !== lastDateKey;
                lastDateKey = dateKey;
                return (
                  <Fragment key={msg.id}>
                  {showDateSeparator && (
                    <div className="flex justify-center pb-1 pt-3 first:pt-0">
                      <span className="rounded-full bg-zinc-200/80 px-3 py-1 text-[11px] font-medium text-zinc-600 shadow-sm dark:bg-black dark:text-zinc-300">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div
                    id={`msg-${msg.id}`}
                    className={`group flex items-end gap-2 ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* Botão "Responder" no hover. Aparece do lado de
                        FORA da bolha — esquerda quando outbound (msg
                        nossa, espaço à direita da bolha), direita quando
                        inbound (msg do cliente, espaço à esquerda).
                        Reactions e bolhas curtas mantêm o botão visível.
                        Mensagens já revogadas não mostram ações. */}
                    {isOutbound && !isRevoked && (
                      <div className="flex items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startReply(msg)}
                          className="rounded-full bg-white p-1.5 text-zinc-400 shadow-sm ring-1 ring-zinc-200 hover:text-zinc-700 dark:bg-black dark:ring-zinc-700 dark:hover:text-zinc-100"
                          title="Responder"
                          aria-label="Responder esta mensagem"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(msg)}
                          className="rounded-full bg-white p-1.5 text-zinc-400 shadow-sm ring-1 ring-zinc-200 hover:text-red-600 dark:bg-black dark:ring-zinc-700 dark:hover:text-red-400"
                          title="Deletar pra todos"
                          aria-label="Deletar mensagem pra todos"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {!isOutbound && (
                      <ContactAvatar
                        size="sm"
                        name={
                          assistantMode
                            ? 'Assistente'
                            : conversation.isGroup && msg.senderName
                              ? msg.senderName
                              : conversation.contact.name
                        }
                        avatarUrl={
                          assistantMode || conversation.isGroup
                            ? null
                            : conversation.contact.avatarUrl
                        }
                      />
                    )}
                    <div className="relative min-w-0 max-w-[92%]">
                      {conversation.isGroup && !isOutbound && msg.senderName && (
                        <p className="mb-0.5 ml-1 text-xs font-semibold text-primary">
                          {msg.senderName}
                        </p>
                      )}
                      {isOutbound && (msg.sender?.name || (msg.senderId && msg.senderId === user?.id && user?.name)) && (
                        <p className="mb-0.5 mr-1 text-right text-xs font-semibold text-primary">
                          {msg.sender?.name || user?.name}
                        </p>
                      )}
                      {msg.metadata?.replyTo?.story && (
                        <StoryReplyCard
                          story={msg.metadata.replyTo.story}
                          isOutbound={isOutbound}
                        />
                      )}
                      {msg.metadata?.replyTo?.ad && (
                        <div
                          className={`mb-1 rounded-xl border px-3 py-2 text-xs ${
                            isOutbound
                              ? 'border-primary/40 bg-primary/10 text-primary-foreground/80'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-black dark:text-zinc-400'
                          }`}
                        >
                          <p className="text-[10px] uppercase tracking-wider opacity-70">
                            Respondeu ao anúncio
                          </p>
                          {msg.metadata.replyTo.ad.title && (
                            <p className="mt-0.5 font-medium">
                              {msg.metadata.replyTo.ad.title}
                            </p>
                          )}
                        </div>
                      )}
                      {/* Quote box: aparece quando a msg respondeu outra
                          mensagem (reply nativo do WhatsApp/Cloud API ou
                          fallback do Instagram que persistimos via
                          metadata.replyTo). Click scrolla até a msg
                          original quando a temos no histórico carregado. */}
                      {msg.metadata?.replyTo &&
                        (msg.metadata.replyTo.previewText ||
                          msg.metadata.replyTo.senderName) && (
                          <button
                            type="button"
                            onClick={() => {
                              const targetId = msg.metadata?.replyTo?.messageId;
                              if (!targetId) return;
                              const el = document.getElementById(
                                `msg-${targetId}`,
                              );
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                el.classList.add('ring-2', 'ring-primary');
                                setTimeout(
                                  () =>
                                    el.classList.remove('ring-2', 'ring-primary'),
                                  1500,
                                );
                              }
                            }}
                            className={`mb-1 block w-full rounded-md border-l-2 border-primary px-2 py-1 text-left text-xs ${
                              isOutbound
                                ? 'bg-primary/10 text-primary-foreground/80'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/10'
                            }`}
                          >
                            {msg.metadata.replyTo.senderName && (
                              <p className="text-[10px] font-semibold opacity-80">
                                {msg.metadata.replyTo.senderName}
                              </p>
                            )}
                            {msg.metadata.replyTo.previewText && (
                              <p className="mt-0.5 truncate">
                                {msg.metadata.replyTo.previewText}
                              </p>
                            )}
                          </button>
                        )}
                      {isRevoked ? (
                        <div
                          className={`flex items-center gap-2 rounded-2xl border border-dashed px-4 py-2.5 italic ${
                            isOutbound
                              ? 'rounded-br-md border-primary/40 bg-primary/5 text-primary/70'
                              : 'rounded-bl-md border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-white/10 dark:bg-black dark:text-zinc-500'
                          }`}
                          title={
                            msg.revokeSucceededRemote
                              ? 'Mensagem deletada pra todos (provider confirmou).'
                              : 'Deletada apenas no AxChat — o cliente ainda pode estar vendo no app dele.'
                          }
                        >
                          <Ban className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-sm">
                            Mensagem deletada
                            {msg.revokeSucceededRemote === false ? ' (só aqui)' : ''}
                          </span>
                          <span className="ml-auto text-[10px] opacity-70">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      ) : msg.type === 'AUDIO' ? (
                        <>
                          <AudioMessagePlayer
                            message={msg}
                            isOutbound={isOutbound}
                            onTranscribed={() => {
                              queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
                            }}
                          />
                          <div
                            className={`mt-1 flex items-center gap-1 px-1 text-[10px] ${
                              isOutbound ? 'justify-end text-zinc-400' : 'text-zinc-400'
                            }`}
                          >
                            <span>{formatTime(msg.createdAt)}</span>
                            {isOutbound && (
                              <span title={statusTooltip(msg.status, msg.failedReason)}>
                                <StatusIcon
                                  className={`h-3 w-3 ${
                                    msg.status === 'FAILED'
                                      ? 'text-red-500'
                                      : msg.status === 'READ'
                                        ? 'text-primary'
                                        : ''
                                  }`}
                                />
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div
                          className={`rounded-2xl px-4 py-2.5 ${
                            isPrivateNote
                              ? 'rounded-br-md border border-dashed border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-600/50 dark:bg-amber-900/20 dark:text-amber-200'
                              : isOutbound
                                ? 'rounded-br-md bg-primary text-primary-foreground'
                                : 'rounded-bl-md bg-white shadow-sm dark:bg-black dark:text-zinc-100'
                          }`}
                        >
                          {msg.type === 'TEXT' ? (
                            <MessageText
                              text={msg.content?.text || ''}
                              isOutbound={isOutbound}
                            />
                          ) : msg.type === 'IMAGE' ? (
                            <MediaImage message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'VIDEO' ? (
                            <MediaVideo message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'DOCUMENT' ? (
                            <MediaDocument message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'STICKER' ? (
                            <MediaSticker message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'LOCATION' ? (
                            <MediaLocation message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'INTERNAL_NOTE' ? (
                            <div className="flex items-start gap-1.5">
                              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                              <span>{msg.content?.text || ''}</span>
                            </div>
                          ) : msg.type === 'TEMPLATE' ? (
                            <TemplateMessage content={msg.content} isOutbound={isOutbound} />
                          ) : (
                            <p className="text-sm italic opacity-70">[{msg.type}]</p>
                          )}
                          <div
                            className={`mt-1 flex items-center gap-1 text-[10px] ${
                              isOutbound ? 'justify-end opacity-70' : 'text-zinc-400'
                            }`}
                          >
                            <span>{formatTime(msg.createdAt)}</span>
                            {isOutbound && (
                              <span title={statusTooltip(msg.status, msg.failedReason)}>
                                <StatusIcon
                                  className={`h-3 w-3 ${
                                    msg.status === 'FAILED'
                                      ? 'text-red-300'
                                      : msg.status === 'READ'
                                        ? 'text-blue-300'
                                        : ''
                                  }`}
                                />
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {reactions.length > 0 && (
                        <div className={`absolute -bottom-2 ${isOutbound ? 'right-2' : 'left-2'} flex gap-0.5`}>
                          <span className="rounded-full bg-white px-1.5 py-0.5 text-xs shadow-sm ring-1 ring-zinc-200/80 dark:bg-black dark:ring-zinc-700">
                            {[...new Set(reactions)].join('')}
                            {reactions.length > 1 && (
                              <span className="ml-0.5 text-[10px] text-zinc-400">{reactions.length}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    {!isOutbound && (
                      <button
                        type="button"
                        onClick={() => startReply(msg)}
                        className="self-center rounded-full bg-white p-1.5 text-zinc-400 opacity-0 shadow-sm ring-1 ring-zinc-200 transition-opacity hover:text-zinc-700 group-hover:opacity-100 dark:bg-black dark:ring-zinc-700 dark:hover:text-zinc-100"
                        title="Responder"
                        aria-label="Responder esta mensagem"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  </Fragment>
                );
              });
            })()}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {replyingTo && (
        <ReplyPreviewBar message={replyingTo} onCancel={cancelReply} />
      )}
  <ChatInput
    onSend={handleSend}
    onSendAudio={handleSendAudio}
    onSendFile={handleSendFile}
    onOpenTemplates={conversation.channel.type === 'WHATSAPP_OFFICIAL' ? () => setTemplatePanelOpen(true) : undefined}
    onTypingChange={(isTyping) => emit('typing', { conversationId: conversation.id, isTyping })}
    disabled={conversation.status === 'CLOSED'}
    privateMode={privateMode}
    onPrivateModeChange={setPrivateMode}
    quickReplies={quickReplies}
    engagementBlocked={engagementBlocked}
  />
  {/* Typing indicator */}
  {typingUsers.size > 0 && (
    <div className="flex items-center gap-1.5 px-4 py-1 text-[11px] text-zinc-400 dark:text-zinc-500">
      <span className="flex items-center gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0.3s]" />
      </span>
      Alguém está digitando...
    </div>
  )}
  {templatePanelOpen && (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20">
      <div className="flex h-[80vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900">
        <WhatsappTemplateSelector
          channelId={conversation.channel.id}
          channelType={conversation.channel.type}
          onSendTemplate={(template, params) => handleSendTemplate(template, params)}
          onClose={() => setTemplatePanelOpen(false)}
        />
      </div>
    </div>
  )}
    </div>
  );
}

/**
 * Barra fina logo acima do ChatInput mostrando que estamos compondo uma
 * resposta a uma mensagem específica. X cancela. Replica o visual do
 * WhatsApp Web — borda colorida à esquerda + sender + preview truncado.
 */
function ReplyPreviewBar({
  message,
  onCancel,
}: {
  message: Message;
  onCancel: () => void;
}) {
  const sender =
    message.direction === 'OUTBOUND'
      ? message.sender?.name || 'Você'
      : (message.senderName ?? 'Cliente');
  const c = (message.content ?? {}) as Record<string, any>;
  const preview =
    (typeof c.text === 'string' && c.text) ||
    (typeof c.caption === 'string' && c.caption) ||
    `[${(message.type || 'mensagem').toLowerCase()}]`;
  return (
    <div className="flex items-center gap-2 border-t border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-black">
      <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
        <p className="text-xs font-medium text-primary">Respondendo {sender}</p>
        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
          {preview}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        aria-label="Cancelar resposta"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
