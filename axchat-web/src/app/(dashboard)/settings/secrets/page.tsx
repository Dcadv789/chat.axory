'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { secretsService, type OrganizationSecret } from '@/features/ai-agents/services/secrets.service';
import { toast } from 'sonner';

export default function SettingsSecretsPage() {
  const [secrets, setSecrets] = useState<OrganizationSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await secretsService.list();
      setSecrets(list);
    } catch {
      toast.error('Erro ao carregar variáveis de ambiente');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const key = newKey.trim().toUpperCase();
    if (!key) return toast.error('Informe o nome da variável');
    if (!newValue.trim()) return toast.error('Informe o valor da variável');

    try {
      await secretsService.upsert({ key, value: newValue.trim() });
      toast.success(`Variável "${key}" salva`);
      setNewKey('');
      setNewValue('');
      setAdding(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao salvar variável');
    }
  };

  const handleRemove = async (key: string) => {
    try {
      await secretsService.remove(key);
      toast.success(`Variável "${key}" removida`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao remover variável');
    }
  };

  const toggleVisible = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Variáveis de Ambiente
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Gerencie variáveis de ambiente que suas Skills HTTP/SQL podem
          consumir via {'{{env.NOME_DA_CHAVE}}'}. As variáveis salvas aqui
          sobrescrevem as do servidor. Use isso para configurar chaves de API
          e URLs de banco específicas da sua organização sem depender do
          suporte técnico.
        </p>
      </div>

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <Plus className="h-4 w-4" />
          Nova variável
        </button>
      )}

      {adding && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-3 dark:border-white/10 dark:bg-white/5">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Nome da variável (ex: MINHA_API_KEY)
            </label>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              placeholder="MINHA_API_KEY"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Valor
            </label>
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="sk-..."
              type="password"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Salvar
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewKey('');
                setNewValue('');
              }}
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Carregando...</p>
      ) : secrets.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <KeyRound className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-2 text-sm text-zinc-500">
            Nenhuma variável de ambiente configurada.
          </p>
          <p className="text-xs text-zinc-400">
            Adicione chaves de API, URLs de banco e outras configurações que
            suas Skills precisam.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {secrets.map((secret) => {
            const visible = visibleKeys.has(secret.key);
            return (
              <div
                key={secret.key}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black"
              >
                <KeyRound className="h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {secret.key}
                  </p>
                  <p className="truncate font-mono text-xs text-zinc-400">
                    {visible ? secret.value : '••••••••'}
                  </p>
                </div>
                <button
                  onClick={() => toggleVisible(secret.key)}
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-300"
                  title={visible ? 'Ocultar valor' : 'Mostrar valor'}
                >
                  {visible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => handleRemove(secret.key)}
                  className="shrink-0 rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  title="Remover variável"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
