'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Loader2 } from 'lucide-react';
import { superAdminService } from '../services/super-admin.service';

const SECTORS = [
  { key: 'ATENDIMENTO', label: 'Atendimento' },
  { key: 'MARKETING', label: 'Marketing' },
  { key: 'PESSOAL', label: 'Assistente Pessoal' },
] as const;

type CloneResult = {
  created: string[];
  skipped: string[];
  channelsLinked: number;
  skillsCopied: number;
  skillsMissing: string[];
};

export function CloneAgentsPanel() {
  const { data: orgs = [] } = useQuery({
    queryKey: ['super-admin-organizations'],
    queryFn: () => superAdminService.organizations(),
  });

  const [sourceOrgId, setSourceOrgId] = useState('');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [sectors, setSectors] = useState<string[]>(['ATENDIMENTO']);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CloneResult | null>(null);

  const toggleSector = (k: string) =>
    setSectors((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

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
      });
      setResult(r);
      toast.success(
        `${r.created.length} agente(s) clonado(s)` +
          (r.skipped.length ? `, ${r.skipped.length} já existiam` : ''),
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao clonar agentes');
    } finally {
      setBusy(false);
    }
  };

  const selectCls =
    'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Clonar agentes entre empresas
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Copia os agentes de uma empresa-modelo (origem) pra outra (destino),
          por setor inteiro. Mantém a hierarquia e liga aos canais ativos do
          destino. <strong>Não altera a origem</strong> e não duplica (pula
          agentes que já existem no destino pelo nome).
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              {orgs.map((o: { id: string; name: string }) => (
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
              {orgs.map((o: { id: string; name: string }) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sourceOrgId && sourceOrgId === targetOrgId && (
          <p className="mt-2 text-xs text-red-500">
            Origem e destino precisam ser empresas diferentes.
          </p>
        )}

        <div className="mt-4">
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

        <button
          onClick={clone}
          disabled={!canClone}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Clonar agentes
        </button>
      </div>

      {result && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-white/10 dark:bg-black">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Resultado
          </h3>
          <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-300">
            <li>
              ✅ Criados ({result.created.length}):{' '}
              {result.created.join(', ') || '—'}
            </li>
            {result.skipped.length > 0 && (
              <li>
                ↩️ Já existiam, pulados ({result.skipped.length}):{' '}
                {result.skipped.join(', ')}
              </li>
            )}
            <li>🔗 Vínculos com canais criados: {result.channelsLinked}</li>
            <li>🧩 Skills vinculadas: {result.skillsCopied}</li>
            {result.skillsMissing.length > 0 && (
              <li className="text-amber-600 dark:text-amber-400">
                ⚠ Skills que não existem no destino (vínculo não copiado):{' '}
                {result.skillsMissing.join(', ')}. Para Marketing, use o
                provisionamento do add-on que cria as skills.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
