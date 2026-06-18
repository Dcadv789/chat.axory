'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X, GripVertical, Loader2 } from 'lucide-react';
import { contactsService } from '@/features/contacts/services/contacts.service';

interface CustomField {
  key: string;
  label: string;
  value: string;
  type: 'text' | 'email' | 'phone' | 'url';
}

interface ContactCustomFieldsProps {
  contactId: string;
  metadata: Record<string, any>;
}

export function ContactCustomFields({ contactId, metadata }: ContactCustomFieldsProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const fields: CustomField[] = Array.isArray(metadata?.customFields)
    ? metadata.customFields
    : [];

  const [localFields, setLocalFields] = useState<CustomField[]>(fields);

  const hasChanges = JSON.stringify(localFields) !== JSON.stringify(fields);

  const addField = () => {
    setLocalFields((prev) => [
      ...prev,
      { key: '', label: '', value: '', type: 'text' },
    ]);
  };

  const removeField = (index: number) => {
    setLocalFields((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, partial: Partial<CustomField>) => {
    setLocalFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...partial } : f)),
    );
  };

  const handleSave = async () => {
    const valid = localFields.every((f) => f.key && f.label);
    if (!valid) {
      toast.error('Preencha key e label de todos os campos');
      return;
    }
    setSaving(true);
    try {
      await contactsService.update(contactId, {
        metadata: { ...metadata, customFields: localFields },
      });
      toast.success('Campos customizados salvos');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setLocalFields(fields);
    setEditing(false);
  };

  if (!editing && fields.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Campos personalizados
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="py-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
          Nenhum campo personalizado
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Campos personalizados ({fields.length})
        </p>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-primary hover:underline"
          >
            Editar
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          {localFields.map((field, i) => (
            <div key={i} className="flex items-start gap-1.5 rounded-md border border-zinc-100 bg-zinc-50 p-2 dark:border-white/5 dark:bg-white/5">
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="Label (ex: Empresa)"
                  className="w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[11px] font-medium text-zinc-900 outline-none focus:border-primary/50 dark:border-white/10 dark:bg-black dark:text-zinc-100"
                />
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => updateField(i, { value: e.target.value })}
                  placeholder="Valor"
                  className="w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[12px] text-zinc-700 outline-none focus:border-primary/50 dark:border-white/10 dark:bg-black dark:text-zinc-300"
                />
                <input
                  type="text"
                  value={field.key}
                  onChange={(e) => updateField(i, { key: e.target.value })}
                  placeholder="Chave interna (ex: empresa)"
                  className="w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-400 outline-none focus:border-primary/50 dark:border-white/10 dark:bg-black"
                />
              </div>
              <button
                type="button"
                onClick={() => removeField(i)}
                className="mt-1 rounded p-0.5 text-zinc-300 hover:text-red-500 dark:text-zinc-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addField}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-zinc-200 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600 dark:border-white/20 dark:hover:border-white/30"
          >
            <Plus className="h-3 w-3" />
            Adicionar campo
          </button>
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {fields.map((field, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-zinc-50 px-2.5 py-1.5 dark:bg-white/5">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {field.label}
                </p>
                <p className="truncate text-[13px] text-zinc-800 dark:text-zinc-200">
                  {field.value || '-'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
