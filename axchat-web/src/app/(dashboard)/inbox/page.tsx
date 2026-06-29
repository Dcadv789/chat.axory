'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { ConversationList } from '@/features/inbox/components/conversation-list';
import { ChatPanel } from '@/features/inbox/components/chat-panel';
import { AgentRunsSidebar } from '@/features/inbox/components/agent-runs-sidebar';
import { ContactSidebar } from '@/features/inbox/components/contact-sidebar';
import { useShortcut, KeyboardShortcutProvider } from '@/features/keyboard-shortcuts/keyboard-shortcut-context';
import { inboxService, type Conversation } from '@/features/inbox/services/inbox.service';
import { useSocket } from '@/features/inbox/hooks/use-socket';
import { AssistantPanel } from '@/features/assistant/components/assistant-panel';
import { assistantService } from '@/features/assistant/services/assistant.service';
import { useAuthStore } from '@/stores/auth-store';
import { useOrgId } from '@/hooks/use-org-query-key';

const AGENT_LOGS_PREF_KEY = 'inbox.agentLogsOpen';
const CONTACT_SIDEBAR_PREF_KEY = 'inbox.contactSidebarOpen';

/** Registers global keyboard shortcuts for the inbox page. Must be rendered
 *  inside {@link KeyboardShortcutProvider}. */
function InboxShortcuts({
  onToggleAgentLogs,
  onToggleContactSidebar,
  searchInputRef,
}: {
  onToggleAgentLogs: () => void;
  onToggleContactSidebar: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  useShortcut('toggle-agent-logs', onToggleAgentLogs);
  useShortcut('toggle-contact-sidebar', onToggleContactSidebar);
  useShortcut('focus-search', () => {
    searchInputRef.current?.focus();
  });
  return null;
}

export default function InboxPage() {
  const searchParams = useSearchParams();
  const viewId = searchParams.get('view');
  const deepLinkConvId = searchParams.get('conversationId');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  // Persisted across sessions via localStorage so each operator keeps their
  // preferred layout (some live with the sidebar open, others want the chat
  // full width). Read on mount, write whenever it flips.
  const [agentLogsOpen, setAgentLogsOpen] = useState(false);
  const [contactSidebarOpen, setContactSidebarOpen] = useState(true);
  useEffect(() => {
    try {
      setAgentLogsOpen(localStorage.getItem(AGENT_LOGS_PREF_KEY) === '1');
      const saved = localStorage.getItem(CONTACT_SIDEBAR_PREF_KEY);
      // Se nunca foi salvo, padrao e true (aberto). Se foi salvo, usa o valor.
      if (saved !== null) {
        setContactSidebarOpen(saved === '1');
      }
    } catch {
      // SSR / privacy mode — fine, defaults to closed.
    }
  }, []);
  const toggleAgentLogs = useCallback(() => {
    setAgentLogsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AGENT_LOGS_PREF_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage failures — runtime state still flips.
      }
      return next;
    });
  }, []);
  const toggleContactSidebar = useCallback(() => {
    setContactSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CONTACT_SIDEBAR_PREF_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage failures — runtime state still flips.
      }
      return next;
    });
  }, []);
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Detecta a conversa do Assistente Pessoal (canal interno privado do dono)
  // pra mostrar o painel de tarefas/agenda à direita só nela.
  const orgId = useOrgId();
  const assistantEnabled = useAuthStore(
    (s) => s.organizations.find((o) => o.id === s.activeOrgId)?.assistantEnabled,
  );
  const { data: assistantCfg } = useQuery({
    queryKey: ['assistant-config', orgId],
    queryFn: () => assistantService.config(),
    enabled: !!assistantEnabled,
    staleTime: 5 * 60 * 1000,
  });
  const isAssistantChat =
    !!assistantCfg?.channelId &&
    activeConversation?.channelId === assistantCfg.channelId;

  // Switching inbox view should clear the open conversation so the right
  // panel doesn't show a thread that may not even match the new filter.
  useEffect(() => {
    setActiveConversation(null);
  }, [viewId]);

  // Deep-link from elsewhere (e.g. Jarvis Execuções drawer): when the URL
  // carries ?conversationId=..., resolve it once and open in the chat panel.
  // We don't loop on it — the user clicking another thread should override.
  useEffect(() => {
    if (!deepLinkConvId) return;
    if (activeConversation?.id === deepLinkConvId) return;
    let cancelled = false;
    inboxService
      .getConversation(deepLinkConvId)
      .then((conv) => {
        if (!cancelled) setActiveConversation(conv);
      })
      .catch(() => {
        // Silent — broken link shouldn't break the inbox; user still sees
        // the list and can pick another conversation.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkConvId]);

  // Keep the active conversation object in sync with the backend (enrichment, last message, etc.)
  // Realtime atualiza o cache na hora (abaixo); o poll fica só como rede de
  // segurança pra mudanças que não emitem evento (10s em vez de 5s).
  const { data: freshActive } = useQuery({
    queryKey: ['conversation', activeConversation?.id],
    queryFn: () => inboxService.getConversation(activeConversation!.id),
    enabled: !!activeConversation?.id,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (freshActive && freshActive.id === activeConversation?.id) {
      setActiveConversation(freshActive);
    }
  }, [freshActive, activeConversation?.id]);

  // Atualização em tempo real do detalhe da conversa: o backend emite
  // `conversation:updated` (atribuição, setor, status, AI...). Em vez de
  // esperar o poll, mesclamos o payload no cache ['conversation', id] na hora.
  // Merge parcial: o payload pode vir sem relações (contact/channel) em alguns
  // caminhos, então preservamos o que já está no cache.
  const { on } = useSocket();
  useEffect(() => {
    const off = on('conversation:updated', (payload: { conversation?: Partial<Conversation> & { id?: string } }) => {
      const conv = payload?.conversation;
      if (!conv?.id) return;
      queryClient.setQueryData(
        ['conversation', conv.id],
        (prev: Conversation | undefined) =>
          prev ? { ...prev, ...conv } : (conv as Conversation),
      );
    });
    return off;
  }, [on, queryClient]);

  const handleConversationUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    if (activeConversation) {
      queryClient.invalidateQueries({
        queryKey: ['messages', activeConversation.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['conversation', activeConversation.id],
      });
    }
  }, [queryClient, activeConversation]);

  return (
    <KeyboardShortcutProvider>
      <InboxShortcuts
        onToggleAgentLogs={toggleAgentLogs}
        onToggleContactSidebar={toggleContactSidebar}
        searchInputRef={searchInputRef}
      />
      <div className="flex h-full">
        <ConversationList
          activeId={activeConversation?.id || null}
          onSelect={setActiveConversation}
          viewId={viewId}
        />

        {activeConversation ? (
          <>
            <ChatPanel
              key={activeConversation.id}
              conversation={activeConversation}
              onConversationUpdate={handleConversationUpdate}
              onToggleAgentLogs={toggleAgentLogs}
              agentLogsOpen={agentLogsOpen}
              onToggleContactSidebar={toggleContactSidebar}
              contactSidebarOpen={contactSidebarOpen}
              assistantMode={isAssistantChat}
            />
            {/* Conversa do Assistente: painel de tarefas/agenda à direita (só
                nela). As barras de contato/logs continuam funcionando pelos
                botões do topo — empilham como barras verticais adicionais. */}
            {isAssistantChat && (
              <AssistantPanel key={`assistant-${activeConversation.id}`} />
            )}
            {agentLogsOpen && (
              <AgentRunsSidebar
                key={`logs-${activeConversation.id}`}
                conversationId={activeConversation.id}
                onClose={toggleAgentLogs}
              />
            )}
            {contactSidebarOpen && (
              <ContactSidebar
                key={`contact-${activeConversation.id}`}
                contactId={activeConversation.contact?.id}
                onClose={toggleContactSidebar}
              />
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-black">
              <MessageSquare className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-zinc-700 dark:text-zinc-300">
              AxChat
            </h2>
            <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
              Selecione uma conversa para começar
            </p>
          </div>
        )}
      </div>
    </KeyboardShortcutProvider>
  );
}
