'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, KanbanSquare, Trash2, Star, Archive } from 'lucide-react';
import { toast } from 'sonner';
import {
  pipelinesService,
  type Pipeline,
} from '@/features/pipelines/services/pipelines.service';

export default function PipelinesIndexPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => pipelinesService.list(),
  });

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const p = await pipelinesService.create({ name: name.trim() });
      toast.success(`Pipeline "${p.name}" criado com 5 stages padrão`);
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      setName('');
      setCreating(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao criar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Pipeline) => {
    if (!confirm(`Excluir o pipeline "${p.name}" e todos os cards?`)) return;
    try {
      await pipelinesService.remove(p.id);
      toast.success('Pipeline removido');
      qc.invalidateQueries({ queryKey: ['pipelines'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao excluir');
    }
  };

  const handleSetDefault = async (p: Pipeline) => {
    try {
      await pipelinesService.update(p.id, { isDefault: true } as any);
      toast.success(`"${p.name}" agora é o pipeline padrão`);
      qc.invalidateQueries({ queryKey: ['pipelines'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <KanbanSquare className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Pipelines</h1>
              <p className="text-xs text-zinc-500">
                Kanban customizado por org. Cada pipeline tem stages próprias e cards independentes.
              </p>
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo pipeline
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
      {creating && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-black">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do pipeline (ex: Vendas Mentoria)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? '…' : 'Criar'}
          </button>
          <button
            onClick={() => setCreating(false)}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <div className="col-span-full text-center text-sm text-zinc-400">
            Carregando…
          </div>
        )}
        {!isLoading && pipelines.length === 0 && (
          <div className="col-span-full rounded-xl border-2 border-dashed border-zinc-200 p-10 text-center dark:border-white/10">
            <KanbanSquare className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Nenhum pipeline criado ainda
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Click em "Novo pipeline" pra começar com 5 stages padrão.
            </p>
          </div>
        )}
        {pipelines.map((p) => (
          <div
            key={p.id}
            className="group relative rounded-xl border border-zinc-200 bg-white p-4 hover:border-primary/40 hover:shadow-sm dark:border-white/10 dark:bg-black"
          >
            <Link href={`/pipelines/${p.id}`} className="block">
              <div className="flex items-center gap-2">
                <KanbanSquare className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {p.name}
                </h3>
                {p.isDefault && (
                  <Star
                    className="h-3.5 w-3.5 text-amber-500"
                    fill="currentColor"
                  />
                )}
              </div>
              {p.description && (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                  {p.description}
                </p>
              )}
              <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500">
                <span>
                  {p.stages?.length ?? 0} stages · {p._count?.cards ?? 0} cards
                </span>
              </div>
            </Link>
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {!p.isDefault && (
                <button
                  onClick={() => handleSetDefault(p)}
                  title="Marcar como padrão"
                  className="rounded p-1 text-zinc-400 hover:bg-amber-50 hover:text-amber-600"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => handleDelete(p)}
                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
