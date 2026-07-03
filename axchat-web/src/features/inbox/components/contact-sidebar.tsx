'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, Loader2, MessageSquare, Pencil, Phone, Mail, Tag, Trash2,
  Check, XCircle, Copy, UserPen,
} from 'lucide-react';
import { contactsService } from '@/features/contacts/services/contacts.service';
import { ContactNotesPanel } from './contact-notes-panel';
import { ContactCustomFields } from './contact-custom-fields';
import { ContactEditDrawer } from './contact-edit-drawer';
import { formatPhone } from '../utils/inbox-errors';

interface ContactSidebarProps {
  contactId: string;
  onClose: () => void;
}

export function ContactSidebar({ contactId, onClose }: ContactSidebarProps) {
  const queryClient = useQueryClient();
  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact-detail', contactId],
    queryFn: () => contactsService.getById(contactId),
    enabled: !!contactId,
  });

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<'name' | 'phone' | 'email' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const startEdit = (field: 'name' | 'phone' | 'email') => {
    if (!contact) return;
    setEditing(field);
    setEditValue(contact[field] || '');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!contact || !editing) return;
    setSaving(true);
    try {
      await contactsService.update(contact.id, { [editing]: editValue || null });
      toast.success(`${editing === 'name' ? 'Nome' : editing === 'phone' ? 'Telefone' : 'E-mail'} atualizado`);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['contact-detail', contactId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!contact) return;
    if (!window.confirm(`Tem certeza que deseja excluir o contato ${contact.name || contact.phone}?`)) return;
    try {
      await contactsService.remove(contact.id);
      toast.success('Contato excluído');
      onClose();
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir contato');
    }
  };

  const secondaryPhone = (contact as any)?.metadata?.secondaryPhone as string | undefined;

  return (
    <>
      <div className="flex w-80 flex-col border-l border-zinc-200/80 bg-white dark:border-white/10 dark:bg-black">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 dark:border-white/10">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Contato
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : !contact ? (
            <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
              Contato não encontrado
            </div>
          ) : (
            <div className="space-y-5 p-4">
              {/* Avatar + Nome */}
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary dark:bg-primary/20 dark:text-primary-foreground">
                  {contact.avatarUrl ? (
                    <img
                      src={contact.avatarUrl}
                      alt={contact.name || 'avatar'}
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    (contact.name || contact.phone || '?').slice(0, 2).toUpperCase()
                  )}
                </div>

                <div className="w-full">
                  {editing === 'name' ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-primary/50 dark:border-white/10 dark:bg-black dark:text-zinc-100"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      />
                      <button onClick={saveEdit} disabled={saving} title="Salvar" className="rounded p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={cancelEdit} title="Cancelar" className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="group flex items-center justify-center gap-1.5">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {contact.name || 'Sem nome'}
                      </p>
                      <button
                        onClick={() => startEdit('name')}
                        className="rounded p-0.5 text-zinc-300 opacity-0 transition-all hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
                        title="Editar nome"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Botão Editar Contato — agora na seção Ações abaixo */}
              </div>

              {/* Info fields */}
              <div className="space-y-2">
                {/* Telefone */}
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  {editing === 'phone' ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-primary/50 dark:border-white/10 dark:bg-black dark:text-zinc-100"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      />
                      <button onClick={saveEdit} disabled={saving} title="Salvar" className="shrink-0 rounded p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </button>
                      <button onClick={cancelEdit} title="Cancelar" className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
                        <XCircle className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="group flex min-w-0 flex-1 items-center gap-0.5">
                      <span className="truncate text-[13px] text-zinc-700 dark:text-zinc-300">
                        {contact.phone ? formatPhone(contact.phone) : '—'}
                      </span>
                      <button
                        onClick={() => startEdit('phone')}
                        className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition-all hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
                        title="Editar telefone"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {contact.phone && (
                        <button
                          onClick={() => copyToClipboard(contact.phone!, 'Telefone')}
                          className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition-all hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
                          title="Copiar telefone"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Telefone secundário */}
                {secondaryPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                      {formatPhone(secondaryPhone)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(secondaryPhone, 'Telefone secundário')}
                      className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition-all hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
                      title="Copiar telefone secundário"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* E-mail */}
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  {editing === 'email' ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <input
                        type="email"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-primary/50 dark:border-white/10 dark:bg-black dark:text-zinc-100"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      />
                      <button onClick={saveEdit} disabled={saving} title="Salvar" className="shrink-0 rounded p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </button>
                      <button onClick={cancelEdit} title="Cancelar" className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
                        <XCircle className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="group flex min-w-0 flex-1 items-center gap-0.5">
                      <span className="truncate text-[13px] text-zinc-700 dark:text-zinc-300">
                        {contact.email || '—'}
                      </span>
                      <button
                        onClick={() => startEdit('email')}
                        className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition-all hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
                        title="Editar e-mail"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {contact.email && (
                        <button
                          onClick={() => copyToClipboard(contact.email!, 'E-mail')}
                          className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition-all hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
                          title="Copiar e-mail"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  Criado em {formatDate(contact.createdAt)}
                </p>
              </div>

              {/* Ações — apenas ícones */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Ações
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => toast.info('Nova conversa — em breve')}
                    title="Nova conversa"
                    className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toast.info('Etiquetar conversa — use o botão de tags na lista')}
                    title="Etiquetar"
                    className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  >
                    <Tag className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditDrawerOpen(true)}
                    title="Editar contato"
                    className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  >
                    <UserPen className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleDeleteContact}
                    title="Excluir contato"
                    className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Canais */}
              {contact.channels?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Canais
                  </p>
                  {contact.channels.map((ch: any) => (
                    <div
                      key={ch.id}
                      className="flex items-center gap-2 rounded-md bg-zinc-50 px-2.5 py-1.5 text-[12px] dark:bg-white/5"
                    >
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {ch.channel.name}
                      </span>
                      <span className="truncate text-zinc-400">{ch.externalId}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tags */}
              {contact.tags?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {contact.tags.map((t: any) => (
                      <span
                        key={t.tag.id}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: `${t.tag.color}1f`,
                          color: t.tag.color,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: t.tag.color }}
                        />
                        {t.tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas */}
              <ContactNotesPanel contactId={contactId} />

              {/* Campos customizados */}
              <ContactCustomFields
                contactId={contactId}
                metadata={contact.metadata ?? {}}
              />

              {/* Conversas anteriores */}
              {contact.conversations && contact.conversations.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Conversas anteriores ({contact.conversations.length})
                  </p>
                  <div className="space-y-1">
                    {contact.conversations.slice(0, 10).map((conv: any) => (
                      <div
                        key={conv.id}
                        className="flex items-center gap-2 rounded-md bg-zinc-50 px-2.5 py-1.5 dark:bg-white/5"
                      >
                        <MessageSquare className="h-3 w-3 shrink-0 text-zinc-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] text-zinc-600 dark:text-zinc-400">
                            {conv.messages?.[0]?.content?.text
                              ? (conv.messages[0].content.text as string).slice(0, 60)
                              : conv.channel?.name || 'Conversa'}
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            {formatDate(conv.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Drawer de edição completa do contato */}
      {contact && (
        <ContactEditDrawer
          contact={contact}
          open={editDrawerOpen}
          onClose={() => setEditDrawerOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['contact-detail', contactId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
          }}
        />
      )}
    </>
  );
}
