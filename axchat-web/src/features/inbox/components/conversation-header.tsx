'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  XCircle,
  RotateCcw,
  RefreshCw,
  MessageSquare,
  Instagram,
  Phone,
  Mail,
  Send,
  Activity,
  UserCircle,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { ConversationAiToggle } from './conversation-ai-toggle';
import { AssignmentPopover } from './assignment-popover';
import { TransferDepartmentPopover } from './transfer-department-popover';
import { AgentPinPopover } from './agent-pin-popover';
import { PipelinePopover } from './pipeline-popover';
import { ContactInfoPopover } from './contact-info-popover';
import { inboxService, type Conversation } from '../services/inbox.service';
import { useAuthStore } from '@/stores/auth-store';
import {
  conversationSupportsSync,
  getApiErrorMessage,
  formatPhone,
} from '../utils/inbox-errors';

interface ConversationHeaderProps {
  conversation: Conversation;
  onUpdate: () => void;
  /** When provided, renders a toggle button for the agent-runs sidebar. */
  onToggleAgentLogs?: () => void;
  agentLogsOpen?: boolean;
  /** When provided, renders a toggle button for the contact sidebar. */
  onToggleContactSidebar?: () => void;
  contactSidebarOpen?: boolean;
  /**
   * Aprovações pendentes da conversa: com count > 0 renderiza o botão com
   * badge que abre o painel lateral dedicado (os cards não ficam mais na
   * timeline).
   */
  pendingApprovalsCount?: number;
  onToggleApprovals?: () => void;
  approvalsOpen?: boolean;
  /** Alterna a barra de busca de mensagens (lupa). */
  onToggleSearch?: () => void;
  searchOpen?: boolean;
}

function channelMeta(type: string) {
  const t = type.toUpperCase();
  if (t.includes('WHATSAPP') || t.includes('ZAPPFY'))
    return { Icon: Phone, label: 'WhatsApp', accent: 'text-green-600 dark:text-green-400' };
  if (t.includes('INSTAGRAM'))
    return { Icon: Instagram, label: 'Instagram', accent: 'text-pink-600 dark:text-pink-400' };
  if (t.includes('TELEGRAM'))
    return { Icon: Send, label: 'Telegram', accent: 'text-sky-600 dark:text-sky-400' };
  if (t.includes('EMAIL') || t.includes('MAIL'))
    return { Icon: Mail, label: 'Email', accent: 'text-blue-600 dark:text-blue-400' };
  if (t.includes('SMS'))
    return { Icon: MessageSquare, label: 'SMS', accent: 'text-amber-600 dark:text-amber-400' };
  return { Icon: MessageSquare, label: 'Chat', accent: 'text-zinc-500 dark:text-zinc-400' };
}

/**
 * Botão discreto (ao lado do lápis) que revela o canal da conversa num
 * popover — em vez de mostrar o badge fixo embaixo do contato (redundante).
 */
function ChannelButton({ type, name }: { type: string; name: string }) {
  const { Icon, label, accent } = channelMeta(type);
  return (
    <Popover className="relative">
      <PopoverButton
        title="Ver canal"
        className={`flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300`}
      >
        <Icon className="h-3.5 w-3.5" />
      </PopoverButton>
      <PopoverPanel
        anchor="bottom start"
        className="z-50 mt-1.5 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg outline-none dark:border-white/10 dark:bg-black [--anchor-gap:0.25rem]"
      >
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          Canal
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accent}`} />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {label}
          </span>
          <span className="text-xs text-zinc-500">· {name}</span>
        </div>
      </PopoverPanel>
    </Popover>
  );
}

function HeaderAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = name?.slice(0, 2).toUpperCase() || '??';
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'avatar'}
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 object-cover dark:bg-zinc-800"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary dark:bg-primary/20 dark:text-primary-foreground">
      {initials}
    </div>
  );
}

export function ConversationHeader({
  conversation,
  onUpdate,
  onToggleAgentLogs,
  agentLogsOpen,
  onToggleContactSidebar,
  contactSidebarOpen,
  pendingApprovalsCount = 0,
  onToggleApprovals,
  approvalsOpen,
  onToggleSearch,
  searchOpen,
}: ConversationHeaderProps) {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) =>
    s.organizations.find((o) => o.id === s.activeOrgId)?.role,
  );
  // Fixar um agente de IA específico é ação de configuração → só gestão.
  // Transferir/atribuir/pausar IA seguem disponíveis pro atendente (ele opera
  // a própria fila); o backend já escopa tudo por setor.
  const isManager = role === 'OWNER' || role === 'ADMIN';
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const supportsSync = conversationSupportsSync(conversation.channel.type);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await inboxService.syncConversation(conversation.id);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['messages', conversation.id] }),
        queryClient.refetchQueries({ queryKey: ['conversations'] }),
      ]);
      if (result.imported > 0) {
        toast.success(
          `${result.imported} ${result.imported === 1 ? 'mensagem nova' : 'mensagens novas'} sincronizada${result.imported === 1 ? '' : 's'}`,
        );
      } else {
        toast.success('Tudo em dia — nenhuma mensagem nova');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao sincronizar'));
    } finally {
      setIsSyncing(false);
    }
  };
  const handleAction = async (action: () => Promise<any>, successMsg: string) => {
    setIsLoading(true);
    try {
      await action();
      toast.success(successMsg);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-white/10 dark:bg-black">
      <div className="flex items-center gap-3">
        <HeaderAvatar
          name={conversation.contact.name}
          avatarUrl={conversation.contact.avatarUrl}
        />
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {conversation.contact.name || conversation.contact.phone || 'Desconhecido'}
            </span>
            <ContactInfoPopover conversation={conversation} />
            <ChannelButton
              type={conversation.channel.type}
              name={conversation.channel.name}
            />
          </div>
          {conversation.contact.phone && conversation.contact.name && (
            <div className="text-xs text-zinc-500">{formatPhone(conversation.contact.phone)}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {isManager && (
          <AgentPinPopover conversation={conversation} onChanged={onUpdate} />
        )}
        <ConversationAiToggle
          conversation={conversation}
          disabled={isLoading}
          onChange={async (next) => {
            await handleAction(
              () => inboxService.toggleAi(conversation.id, next),
              next === null
                ? 'IA voltou pro padrão (segue config global)'
                : next
                  ? 'IA forçada nesta conversa (sobrepõe global)'
                  : 'IA pausada nesta conversa',
            );
          }}
          onEngage={async () => {
            await handleAction(async () => {
              const result = await inboxService.engageAi(conversation.id);
              if (!result.engaged) {
                throw new Error(
                  result.reason
                    ? `IA não pôde engajar: ${result.reason}`
                    : 'Não foi possível engajar a IA',
                );
              }
              return result;
            }, 'IA engajada — vai responder em segundos');
          }}
        />
        {supportsSync && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            title="Sincronizar mensagens"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}
        {onToggleApprovals && pendingApprovalsCount > 0 && (
          <button
            onClick={onToggleApprovals}
            title={`${pendingApprovalsCount} ação(ões) da IA aguardando sua aprovação`}
            className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              approvalsOpen
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {pendingApprovalsCount > 9 ? '9+' : pendingApprovalsCount}
            </span>
          </button>
        )}
        {/* Ordem fixa dos 3: agente (esq) · contato (meio) · busca (dir) */}
        {onToggleAgentLogs && (
          <button
            onClick={onToggleAgentLogs}
            title={agentLogsOpen ? 'Fechar logs do agente' : 'Abrir logs do agente'}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              agentLogsOpen
                ? 'bg-primary/10 text-primary dark:bg-primary/15'
                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
          </button>
        )}
        {onToggleContactSidebar && (
          <button
            onClick={onToggleContactSidebar}
            title={contactSidebarOpen ? 'Fechar dados do contato' : 'Abrir dados do contato'}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              contactSidebarOpen
                ? 'bg-primary/10 text-primary dark:bg-primary/15'
                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300'
            }`}
          >
            <UserCircle className="h-3.5 w-3.5" />
          </button>
        )}
        {onToggleSearch && (
          <button
            data-search-toggle
            onClick={onToggleSearch}
            title={searchOpen ? 'Fechar busca' : 'Buscar mensagens'}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              searchOpen
                ? 'bg-primary/10 text-primary dark:bg-primary/15'
                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        )}
        {conversation.status !== 'CLOSED' && (
          <AssignmentPopover
            conversation={conversation}
            onChanged={onUpdate}
          />
        )}
        {conversation.status !== 'CLOSED' && (
          <TransferDepartmentPopover
            conversation={conversation}
            onChanged={onUpdate}
          />
        )}
        <PipelinePopover conversation={conversation} onChanged={onUpdate} />
        {conversation.status !== 'CLOSED' && (
          <button
            onClick={() =>
              handleAction(
                () => inboxService.closeConversation(conversation.id),
                'Conversa encerrada',
              )
            }
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-red-50 hover:text-red-600 dark:bg-black dark:text-zinc-300 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <XCircle className="h-3.5 w-3.5" />
            Encerrar
          </button>
        )}
        {conversation.status === 'CLOSED' && (
          <button
            onClick={() =>
              handleAction(
                () => inboxService.reopenConversation(conversation.id),
                'Conversa reaberta',
              )
            }
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reabrir
          </button>
        )}
      </div>
    </div>
  );
}
