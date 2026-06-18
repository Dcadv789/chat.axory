'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Loader2, Phone, Mail, User, Save } from 'lucide-react';
import { contactsService } from '@/features/contacts/services/contacts.service';
import type { Contact } from '@/features/contacts/services/contacts.service';

interface ContactEditDrawerProps {
  contact: Contact;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ContactEditDrawer({ contact, open, onClose, onSaved }: ContactEditDrawerProps) {
  const [name, setName] = useState(contact.name ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [phone2, setPhone2] = useState('');
  const [notes, setNotes] = useState(contact.notes ?? '');
  const [saving, setSaving] = useState(false);

  const metadata = (contact as any).metadata ?? {};
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(contact.name ?? '');
      setPhone(contact.phone ?? '');
      setEmail(contact.email ?? '');
      setPhone2(metadata.secondaryPhone ?? '');
      setNotes(contact.notes ?? '');
      // Load custom fields from metadata (excluding known ones)
      const known = new Set(['secondaryPhone']);
      const fields: Record<string, string> = {};
      for (const [key, val] of Object.entries(metadata)) {
        if (!known.has(key) && typeof val === 'string') {
          fields[key] = val;
        }
      }
      setCustomFields(fields);
    }
  }, [open, contact, metadata]);

  const hasChanges =
    name !== (contact.name ?? '') ||
    phone !== (contact.phone ?? '') ||
    email !== (contact.email ?? '') ||
    phone2 !== (metadata.secondaryPhone ?? '') ||
    notes !== (contact.notes ?? '');

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (name !== (contact.name ?? '')) payload.name = name || null;
      if (phone !== (contact.phone ?? '')) payload.phone = phone || null;
      if (email !== (contact.email ?? '')) payload.email = email || null;
      if (notes !== (contact.notes ?? '')) payload.notes = notes || null;

      // Build metadata — merge existing with changes
      const newMetadata: Record<string, any> = { ...metadata };
      if (phone2 !== (metadata.secondaryPhone ?? '')) {
        newMetadata.secondaryPhone = phone2 || null;
      }
      // Merge custom fields
      for (const [key, val] of Object.entries(customFields)) {
        newMetadata[key] = val;
      }
      // Remove fields that are empty in customFields
      for (const key of Object.keys(newMetadata)) {
        if (key !== 'secondaryPhone' && key in customFields && !customFields[key]) {
          delete newMetadata[key];
        }
      }
      payload.metadata = newMetadata;

      await contactsService.update(contact.id, payload);
      toast.success('Contato atualizado');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao atualizar contato');
    } finally {
      setSaving(false);
    }
  };

  const addCustomField = () => {
    const key = prompt('Nome do campo personalizado:');
    if (key && !customFields[key]) {
      setCustomFields((prev) => ({ ...prev, [key]: '' }));
    } else if (key && customFields[key] !== undefined) {
      toast.error('Campo já existe');
    }
  };

  const removeCustomField = (key: string) => {
    setCustomFields((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Editar contato
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            {/* Nome */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                <User className="h-3.5 w-3.5" />
                Nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100"
              />
            </div>

            {/* Telefone principal */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                <Phone className="h-3.5 w-3.5" />
                Telefone principal
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+5511999999999"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100"
              />
            </div>

            {/* Telefone secundário */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                <Phone className="h-3.5 w-3.5" />
                Telefone secundário
              </label>
              <input
                type="text"
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                placeholder="+5511988888888"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100"
              />
            </div>

            {/* E-mail */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                <Mail className="h-3.5 w-3.5" />
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100"
              />
            </div>

            {/* Observações internas */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Observações internas
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotações sobre este contato..."
                rows={3}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100 resize-none"
              />
            </div>

            {/* Campos personalizados */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Campos personalizados
                </label>
                <button
                  onClick={addCustomField}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Adicionar
                </button>
              </div>
              {Object.entries(customFields).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={key}
                    disabled
                    className="w-[35%] rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-500 dark:border-white/10 dark:bg-black"
                  />
                  <input
                    type="text"
                    value={val}
                    onChange={(e) =>
                      setCustomFields((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    placeholder="Valor"
                    className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-primary/50 dark:border-white/10 dark:bg-black dark:text-zinc-100"
                  />
                  <button
                    onClick={() => removeCustomField(key)}
                    className="shrink-0 rounded p-1 text-zinc-400 hover:text-red-500"
                    title="Remover campo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {Object.keys(customFields).length === 0 && (
                <p className="text-[11px] text-zinc-400 italic">
                  Nenhum campo personalizado
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-white/10">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={(!hasChanges && Object.keys(customFields).length === 0) || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}
