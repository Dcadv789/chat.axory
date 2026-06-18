'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, X, Loader2 } from 'lucide-react';
import { contactsService } from '@/features/contacts/services/contacts.service';
import type { Conversation } from '../services/inbox.service';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from '@headlessui/react';

interface ContactEditDialogProps {
  conversation: Conversation;
}

export function ContactEditDialog({ conversation }: ContactEditDialogProps) {
  const queryClient = useQueryClient();
  const contact = conversation.contact;

  const [name, setName] = useState(contact.name ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const hasChanges =
    name !== (contact.name ?? '') ||
    phone !== (contact.phone ?? '') ||
    email !== (contact.email ?? '');

  const handleSave = async (close: () => void) => {
    if (!hasChanges) {
      close();
      return;
    }
    setSaving(true);
    try {
      await contactsService.update(contact.id, { name: name || null, phone: phone || null, email: email || null });
      toast.success('Contato atualizado');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      close();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao atualizar contato');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setName(contact.name ?? '');
    setPhone(contact.phone ?? '');
    setEmail(contact.email ?? '');
    setDirty(false);
  };

  return (
    <Popover className="relative">
      <PopoverButton className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300">
        <Pencil className="h-3.5 w-3.5" />
      </PopoverButton>
      <PopoverPanel
        anchor="bottom start"
        transition
        className="z-50 mt-1.5 w-72 rounded-lg border border-zinc-200/80 bg-white p-4 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-white/10 dark:bg-black [--anchor-gap:0.25rem]"
      >
        {({ close }) => (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Editar contato
              </p>
              {dirty && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  Resetar
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Nome
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); markDirty(); }}
                  placeholder="Nome do contato"
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Telefone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); markDirty(); }}
                  placeholder="+5511999999999"
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); markDirty(); }}
                  placeholder="email@exemplo.com"
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-primary/50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { handleReset(); close(); }}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSave(close)}
                disabled={!hasChanges || saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  );
}
