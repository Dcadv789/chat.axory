'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Loader2, X } from 'lucide-react';
import {
  superAdminService,
  type SuperAdminOrganization,
} from '../services/super-admin.service';

const SECTORS = [
  { key: 'ATENDIMENTO', label: 'Atendimento' },
  { key: 'MARKETING', label: 'Marketing' },
  { key: 'PESSOAL', label: 'Assistente Pessoal' },
] as const;

type CloneResult = {
  created: string[];
  skipped: string[];
  channelsLinked: number;
  toolsCreated: number;
  skillsCreated: number;
  skillsLinked: number;
};

interface Props {
  open: boolean;
  organizations: SuperAdminOrganization[];
  /** Empresa pré-selecionada como origem (do filtro atual), se houver. */
  defaultSourceOrgId?: string;
  onClose: () => void;
  onChanged: () => void;
}

const selectCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100';

export function CloneAgentsDrawer({
  open,
  organizations,
  defaultSourceOrgId,
  onClose,
  onChanged,
}: Props) {
  const [sourceOrgId, setSourceOrgId] = useState(defaultSourceOrgId ?? '');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [sectors, setSectors] = useState<string[]>(['ATENDIMENTO']);
  const [departments, setDepartments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CloneResult | null>(null);

  // Agentes da origem — pra listar os departamentos disponíveis.
  const { data: sourceAgents = [] } = useQuery({
    queryKey: ['clone-source-agents', sourceOrgId],
    queryFn: () => superAdminService.listAllAgents(sourceOrgId),
    enabled: open && !!sourceOrgId,
  });

  // Departamentos disponíveis na origem dentro dos setores escolhidos.
  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    for (const a of sourceAgents as Array<{ sector?: string; department?: string | null }>) {
      if (sectors.length && a.sector && !sectors.includes(a.sector)) continue;
      if (a.department) set.add(a.department);
    }
    return [...set].sort();
  }, [sourceAgents, sectors]);

  if (!open) return null;

  const orgs = organizations.filter((o) => o.status === 'ACTIVE');

  const toggleSector = (k: string) =>
    setSectors((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const toggleDept = (k: string) =>
    setDepartments((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  const canClone =
    !!sourceOrgId &&
    !!targetOrgId &&
    sourceOrgId !== targetOrgId &&
    sectors.length > 0 &&
    !busy;

  const clone = async () => {
    if (!canClone) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await superAdminService.cloneAgents({
        sourceOrgId,
        targetOrgId,
        sectors,
        departments: departments.length ? departments : undefined,
      });
      setResult(r);
      toast.success(
        `${r.created.length} agente(s) clonado(s)` +
          (r.skipped.length ? `, ${r.skipped.length} já existiam` : ''),
      );
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao clonar agentes');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Clonar agentes
            </h2>
            <p className="text-xs text-zinc-500">
              Copia o setor inteiro de uma empresa-modelo pra outra.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-white/5">
            Mantém a hierarquia (orquestrador + workers) e liga aos canais ativos
            do destino. <strong>Não altera a origem</strong> e não duplica (pula
            agentes que já existem no destino pelo nome).
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Empresa-modelo (origem)
            </label>
            <select
              value={sourceOrgId}
              onChange={(e) => setSourceOrgId(e.target.value)}
              className={selectCls}
            >
              <option value="">Selecione…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Empresa destino
            </label>
            <select
              value={targetOrgId}
              onChange={(e) => setTargetOrgId(e.target.value)}
              className={selectCls}
            >
              <option value="">Selecione…</option>
              {orgs
                .filter((o) => o.id !== sourceOrgId)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Setores a clonar (setor inteiro)
            </label>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((s) => {
                const on = sectors.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSector(s.key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                      on
                        ? 'bg-primary text-primary-foreground ring-primary'
                        : 'bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50 dark:bg-black dark:text-zinc-300 dark:ring-white/10'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {availableDepartments.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Departamentos (opcional) — vazio = todos
              </label>
              <div className="flex flex-wrap gap-2">
                {availableDepartments.map((d) => {
                  const on = departments.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDept(d)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                        on
                          ? 'bg-primary text-primary-foreground ring-primary'
                          : 'bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50 dark:bg-black dark:text-zinc-300 dark:ring-white/10'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                Ex.: clonar só o Contábil ou só o Jurídico. Sem marcar nada,
                copia o setor inteiro.
              </p>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-white/10">
              <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                Resultado
              </p>
              <ul className="mt-1.5 space-y-1 text-zinc-600 dark:text-zinc-300">
                <li>
                  ✅ Criados ({result.created.length}):{' '}
                  {result.created.join(', ') || '—'}
                </li>
                {result.skipped.length > 0 && (
                  <li>
                    ↩️ Já existiam ({result.skipped.length}):{' '}
                    {result.skipped.join(', ')}
                  </li>
                )}
                <li>🔗 Canais vinculados: {result.channelsLinked}</li>
                <li>
                  🧩 Skills: {result.skillsCreated} criada(s),{' '}
                  {result.skillsLinked} vinculada(s) · {result.toolsCreated}{' '}
                  tool(s) criada(s)
                </li>
                <li className="text-zinc-500">
                  Obs.: a definição das skills foi copiada, mas os{' '}
                  <strong>segredos</strong> (token Meta, chaves) não — configure
                  os do destino em Configurações → Variáveis/Integrações.
                </li>
              </ul>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-white/10">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300"
          >
            Fechar
          </button>
          <button
            onClick={clone}
            disabled={!canClone}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Clonar agentes
          </button>
        </footer>
      </div>
    </>
  );
}
