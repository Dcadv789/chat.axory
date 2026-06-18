'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  type GlobalDepartment,
} from '../services/super-admin.service';

export function DepartmentsPanel({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['super-admin-departments'],
    queryFn: () => superAdminService.listDepartments(),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => superAdminService.createDepartment(name),
    onSuccess: () => {
      toast.success('Departamento criado');
      qc.invalidateQueries({ queryKey: ['super-admin-departments'] });
      setNewName('');
      setShowNew(false);
      onChanged();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      superAdminService.updateDepartment(id, name),
    onSuccess: () => {
      toast.success('Departamento atualizado');
      qc.invalidateQueries({ queryKey: ['super-admin-departments'] });
      setEditingId(null);
      setEditName('');
      onChanged();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao atualizar'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => superAdminService.removeDepartment(id),
    onSuccess: () => {
      toast.success('Departamento removido');
      qc.invalidateQueries({ queryKey: ['super-admin-departments'] });
      onChanged();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao remover'),
  });

  const startEdit = (d: GlobalDepartment) => {
    setEditingId(d.id);
    setEditName(d.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const inputCls =
    'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100';

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Departamentos globais ({departments.length})
        </h2>
        {!showNew && (
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Novo departamento
          </button>
        )}
      </div>

      {/* New department form */}
      {showNew && (
        <div className="mt-4 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value.toUpperCase())}
            placeholder="Nome do departamento..."
            className={inputCls}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) createMutation.mutate(newName.trim());
              if (e.key === 'Escape') { setShowNew(false); setNewName(''); }
            }}
            autoFocus
          />
          <button
            onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
            disabled={!newName.trim() || createMutation.isPending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            onClick={() => { setShowNew(false); setNewName(''); }}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:bg-white/5">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-zinc-500">
                  Carregando...
                </td>
              </tr>
            ) : departments.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-zinc-500">
                  Nenhum departamento cadastrado
                </td>
              </tr>
            ) : (
              departments.map((dep) => (
                <tr key={dep.id} className="border-b border-zinc-50 dark:border-white/10">
                  <td className="px-4 py-3 text-xs text-zinc-400">{dep.sortOrder}</td>
                  <td className="px-4 py-3">
                    {editingId === dep.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value.toUpperCase())}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editName.trim()) updateMutation.mutate({ id: dep.id, name: editName.trim() });
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                        <button
                          onClick={() => updateMutation.mutate({ id: dep.id, name: editName.trim() })}
                          disabled={!editName.trim() || updateMutation.isPending}
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={cancelEdit} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{dep.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId !== dep.id && (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => startEdit(dep)}
                          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                          title="Renomear"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remover departamento "${dep.name}"?\nAgentes com este departamento não serão afetados.`))
                              removeMutation.mutate(dep.id);
                          }}
                          className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Departamentos são globais — todas as empresas enxergam a mesma lista. 
        A atualização reflete imediatamente nos filtros e selects da plataforma.
      </p>
    </section>
  );
}
