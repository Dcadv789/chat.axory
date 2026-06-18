'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X, Loader2, MessageSquareText } from 'lucide-react';
import { contactsService } from '@/features/contacts/services/contacts.service';

interface ContactNotesPanelProps {
  contactId: string;
}

export function ContactNotesPanel({ contactId }: ContactNotesPanelProps) {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['contact-notes', contactId],
    queryFn: () => contactsService.listNotes(contactId),
    enabled: !!contactId,
  });

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      await contactsService.addNote(contactId, newNote.trim());
      setNewNote('');
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao adicionar nota');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await contactsService.deleteNote(contactId, noteId);
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao remover nota');
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 24) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Notas ({notes.length})
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-1.5">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Escreva uma nota..."
            rows={3}
            className="w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => { setShowForm(false); setNewNote(''); }}
              className="rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newNote.trim() || saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Adicionar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        </div>
      ) : notes.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
          Nenhuma nota ainda
        </p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((note: any) => (
            <div
              key={note.id}
              className="group relative rounded-md border border-zinc-100 bg-zinc-50 px-2.5 py-2 dark:border-white/5 dark:bg-white/5"
            >
              <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                {note.content}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  {note.author?.name || 'Desconhecido'} &middot; {formatDate(note.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(note.id)}
                  className="rounded p-0.5 text-zinc-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600"
                  title="Remover nota"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
