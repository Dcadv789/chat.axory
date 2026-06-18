'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, GripVertical, MessageSquareDiff } from 'lucide-react';
import { toast } from 'sonner';
import { quickRepliesService, type QuickReply } from '@/features/settings/services/quick-replies.service';

export default function SettingsQuickRepliesPage() {
  const queryClient = useQueryClient();
  const [newShortcut, setNewShortcut] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editShortcut, setEditShortcut] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const { data: replies, isLoading } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: () => quickRepliesService.list(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['quick-replies'] });

  const handleCreate = async () => {
    if (!newShortcut.trim() || !newContent.trim()) return;
    try {
      await quickRepliesService.create({
        shortcut: newShortcut.trim(),
        title: newTitle.trim() || newShortcut.trim(),
        content: newContent.trim(),
      });
      setNewShortcut('');
      setNewTitle('');
      setNewContent('');
      toast.success('Atalho criado');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao criar atalho');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await quickRepliesService.update(id, {
        shortcut: editShortcut,
        title: editTitle,
        content: editContent,
      });
      setEditingId(null);
      toast.success('Atalho atualizado');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao atualizar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este atalho?')) return;
    try {
      await quickRepliesService.remove(id);
      toast.success('Atalho removido');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao remover');
    }
  };

  const startEdit = (r: QuickReply) => {
    setEditingId(r.id);
    setEditShortcut(r.shortcut);
    setEditTitle(r.title);
    setEditContent(r.content);
  };

  return (
    <div>
      {/* Create form */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Novo atalho</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Atalho</label>
            <input
              value={newShortcut}
              onChange={(e) => setNewShortcut(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Ex: saudacao"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
            <p className="mt-0.5 text-[10px] text-zinc-400">Digite / + este atalho no chat</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Título (opcional)</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex: Saudação padrão"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={!newShortcut.trim() || !newContent.trim()}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Criar atalho
            </button>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Conteúdo</label>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Olá! Tudo bem? Em que posso ajudar?"
            rows={3}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
        </div>
      </div>

      {/* List */}
      <div className="mt-6 space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border bg-zinc-50 dark:border-white/10 dark:bg-black" />
          ))
        ) : !replies?.length ? (
          <div className="flex flex-col items-center py-12 text-center">
            <MessageSquareDiff className="h-10 w-10 text-zinc-200 dark:text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-500">Nenhum atalho cadastrado</p>
            <p className="text-xs text-zinc-400">Crie atalhos para agilizar seu atendimento</p>
          </div>
        ) : (
          replies.map((r) => (
            <div key={r.id} className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black">
              {editingId === r.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-500 mb-1">Atalho</label>
                      <input
                        value={editShortcut}
                        onChange={(e) => setEditShortcut(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-500 mb-1">Título</label>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                      />
                    </div>
                    <div className="flex items-end gap-1">
                      <button onClick={() => handleUpdate(r.id)} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Salvar</button>
                      <button onClick={() => setEditingId(null)} className="rounded px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10">Cancelar</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-500 mb-1">Conteúdo</label>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-primary dark:bg-primary/10 dark:text-primary-foreground">
                        /{r.shortcut}
                      </code>
                      {r.title && r.title !== r.shortcut && (
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{r.title}</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{r.content}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(r)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
