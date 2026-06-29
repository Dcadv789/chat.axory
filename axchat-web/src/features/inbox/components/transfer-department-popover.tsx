'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { ChevronDown, Network, Check } from 'lucide-react';
import { toast } from 'sonner';
import { inboxService, type Conversation } from '../services/inbox.service';
import { departmentsService } from '@/features/settings/services/departments.service';

interface Props {
  conversation: Conversation;
  onChanged?: () => void;
}

export function TransferDepartmentPopover({ conversation, onChanged }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsService.list(),
    staleTime: 60_000,
  });

  const currentName =
    conversation.department?.name ??
    departments.find((d) => d.id === conversation.departmentId)?.name ??
    null;

  const handleTransfer = async (
    departmentId: string,
    name: string,
    closeFn: () => void,
  ) => {
    setBusy(true);
    try {
      await inboxService.transferDepartment(conversation.id, departmentId);
      toast.success(`Conversa enviada pro setor ${name}`);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      onChanged?.();
      closeFn();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao transferir');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover className="relative">
      <PopoverButton
        className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/10"
        disabled={busy}
      >
        <Network className="h-3.5 w-3.5" />
        <span className="max-w-[120px] truncate">{currentName ?? 'Setor'}</span>
        <ChevronDown className="h-3 w-3 text-zinc-400" />
      </PopoverButton>

      <PopoverPanel
        anchor="bottom end"
        transition
        className="z-50 mt-1.5 w-64 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-white/10 dark:bg-black [--anchor-gap:0.25rem]"
      >
        {({ close }) => (
          <div className="max-h-72 overflow-y-auto">
            <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Transferir para setor
            </p>
            {departments.length === 0 && (
              <p className="px-2 py-3 text-center text-[11px] text-zinc-400">
                Nenhum setor configurado.
              </p>
            )}
            {departments.map((d) => {
              const isCurrent = d.id === conversation.departmentId;
              return (
                <button
                  key={d.id}
                  onClick={() => handleTransfer(d.id, d.name, close)}
                  disabled={busy || isCurrent}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                    isCurrent
                      ? 'bg-primary/10 dark:bg-primary/20'
                      : 'hover:bg-zinc-50 dark:hover:bg-white/10'
                  }`}
                >
                  <Network className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {d.name}
                      {d.isDefault && (
                        <span className="ml-1 text-[10px] font-normal text-zinc-400">
                          (padrão)
                        </span>
                      )}
                    </p>
                    {d.description && (
                      <p className="truncate text-[10px] text-zinc-500">
                        {d.description}
                      </p>
                    )}
                  </div>
                  {isCurrent && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </PopoverPanel>
    </Popover>
  );
}
