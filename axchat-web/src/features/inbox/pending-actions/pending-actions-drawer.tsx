'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { PendingActionBanner } from './pending-action-banner';
import { usePendingActions } from './use-pending-actions';

interface Props {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Painel lateral dedicado às aprovações pendentes da conversa — os cards
 * moram AQUI, não no meio da timeline. Abre pelo botão com badge no
 * cabeçalho do chat (aparece só quando há pendências).
 */
export function PendingActionsDrawer({ conversationId, open, onClose }: Props) {
  const { data } = usePendingActions(conversationId);
  const actionable = (data ?? []).filter((a) => a.status === 'PENDING');

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop sutil — clique fora fecha, sem esconder a conversa. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 z-30 bg-black/20"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h3 className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Aprovações pendentes
                {actionable.length > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {actionable.length}
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {actionable.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    Nenhuma ação pendente
                  </p>
                  <p className="max-w-[260px] text-xs text-zinc-500">
                    Quando a IA propuser uma ação sensível (gastar verba,
                    publicar, ativar campanha), o card aparece aqui pra você
                    aprovar ou rejeitar.
                  </p>
                </div>
              ) : (
                actionable.map((action, idx) => (
                  <PendingActionBanner key={action.id} action={action} index={idx} />
                ))
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
