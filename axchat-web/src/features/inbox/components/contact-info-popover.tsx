'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Pencil,
  Trash2,
  Plus,
  Tag,
  Phone,
  Mail,
  MessageSquare,
  X,
  Loader2,
  Check,
} from 'lucide-react';
import { contactsService } from '@/features/contacts/services/contacts.service';
import { inboxService } from '../services/inbox.service';
import type { Conversation } from '../services/inbox.service';
import { formatPhone } from '../utils/inbox-errors';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from '@headlessui/react';

interface ContactInfoPopoverProps {
  conversation: Conversation;
}

export function ContactInfoPopover({ conversation }: ContactInfoPopoverProps) {
  const queryClient = useQueryClient();
  const contact = conversation.contact;

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.name ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [phone2, setPhone2] = useState('');
  const [saving, setSaving] = useState(false);

  const hasEditChanges =
    name !== (contact.name ?? '') ||
    phone !== (contact.phone ?? '') ||
    email !== (contact.email ?? '') ||
    phone2 !== '';

  const handleSaveContact = async (close: () => void) => {
    if (!hasEditChanges) { setEditing(false); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (name !== (contact.name ?? '')) payload.name = name || null;
      if (phone !== (contact.phone ?? '')) payload.phone = phone || null;
      if (email !== (contact.email ?? '')) payload.email = email || null;
      if (phone2) {
        payload.metadata = { ...(contact as any).metadata, secondaryPhone: phone2 };
      }
      await contactsService.update(contact.id, payload);
      toast.success('Contato atualizado');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao atualizar contato');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (close: () => void) => {
    if (!window.confirm(`Tem certeza que deseja excluir o contato ${contact.name || contact.phone}?`)) return;
    try {
      await contactsService.remove(contact.id);
      toast.success('Contato excluído');
      close();
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir contato');
    }
  };

  const handleNewConversation = () => {
    toast.info('Nova conversa — em breve');
  };

  const handleTagConversation = () => {
    toast.info('Etiquetar conversa — use o botão de tags na lista');
  };

  const secondaryPhone = (contact as any)?.metadata?.secondaryPhone as string | undefined;

  return (
    <Popover className="relative">
      <PopoverButton className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300">
        <Pencil className="h-3.5 w-3.5" />
      </PopoverButton>
      <PopoverPanel
        anchor="bottom start"
        transition
        className="z-50 mt-1.5 w-80 rounded-lg border border-zinc-200/80 bg-white p-0 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-white/10 dark:bg-zinc-900 [--anchor-gap:0.25rem]"
      >
        {({ close }) => (
          <div>
            {/* Mini header do contato */}
            <div className="border-b border-zinc-100 px-4 py-3 dark:border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary dark:bg-primary/20 dark:text-primary-foreground">
                    {(contact.name || contact.phone || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {contact.name || 'Sem nome'}
                    </p>
                    <p className="text-[11px] text-zinc-400">{formatPhone(contact.phone) || 'Sem telefone'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!editing ? (
                    <button
                      onClick={() => setEditing(true)}
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10"
                      title="Editar contato"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setEditing(false); setName(contact.name ?? ''); setPhone(contact.phone ?? ''); setEmail(contact.email ?? ''); setPhone2(''); }}
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                      title="Cancelar edição"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {editing ? (
              /* ─── Modo edição ─── */
              <div className="space-y-3 px-4 py-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    <Pencil className="h-3 w-3" /> Nome
                  </label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Nome completo"
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    <Phone className="h-3 w-3" /> Telefone principal
                  </label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="+5511999999999"
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    <Phone className="h-3 w-3" /> Telefone secundário
                  </label>
                  <input type="text" value={phone2} onChange={(e) => setPhone2(e.target.value)}
                    placeholder="+5511988888888"
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    <Mail className="h-3 w-3" /> E-mail
                  </label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100" />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={() => { setEditing(false); setName(contact.name ?? ''); setPhone(contact.phone ?? ''); setEmail(contact.email ?? ''); setPhone2(''); }}
                    className="rounded-md px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                    Cancelar
                  </button>
                  <button onClick={() => handleSaveContact(close)} disabled={!hasEditChanges || saving}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              /* ─── Modo visualização — informações ─── */
              <div className="space-y-0">
                {/* Dados do contato */}
                <div className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-2 text-[13px]">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="text-zinc-700 dark:text-zinc-300">{formatPhone(contact.phone) || '—'}</span>
                  </div>
                  {secondaryPhone && (
                    <div className="flex items-center gap-2 text-[13px]">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span className="text-zinc-500">{secondaryPhone}</span>
                    </div>
                  )}
                  {contact.email && (
                    <div className="flex items-center gap-2 text-[13px]">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span className="text-zinc-700 dark:text-zinc-300">{contact.email}</span>
                    </div>
                  )}
                </div>

                {/* Ações rápidas */}
                <div className="border-t border-zinc-100 px-4 py-2 dark:border-white/10">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Ações
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => handleNewConversation()}
                      className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15">
                      <MessageSquare className="h-3 w-3" />
                      Nova conversa
                    </button>
                    <button onClick={() => handleTagConversation()}
                      className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15">
                      <Tag className="h-3 w-3" />
                      Etiquetar
                    </button>
                    <button onClick={() => handleDeleteContact(close)}
                      className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30">
                      <Trash2 className="h-3 w-3" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </PopoverPanel>
    </Popover>
  );
}
