'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aiAgentsService, type AgentSector } from '../services/ai-agents.service';
import { useOrgId } from '@/hooks/use-org-query-key';

/**
 * Pílulas de departamento pra barra de filtro da página de agentes.
 *
 * Usa a MESMA queryKey da lista de agentes — o React Query devolve do cache,
 * então a barra não custa uma requisição a mais. Se usasse chave própria, a
 * página faria dois pedidos iguais e ainda poderia mostrar departamentos de um
 * conjunto de agentes diferente do que está desenhado no organograma.
 */
export function FiltroDeDepartamento({
  agentSector,
  valor,
  onChange,
}: {
  agentSector?: AgentSector;
  valor: string | null;
  onChange: (dept: string | null) => void;
}) {
  const orgId = useOrgId();
  const { data: agents } = useQuery({
    queryKey: ['ai-agents', orgId, agentSector ?? 'all'],
    queryFn: () => aiAgentsService.list(agentSector),
  });

  const departamentos = useMemo(() => {
    if (!agents) return [];
    return [
      ...new Set(
        agents.map((a) => a.department).filter((d): d is string => !!d),
      ),
    ].sort();
  }, [agents]);

  // Sem nenhum departamento não há o que filtrar. Com um só a barra continua
  // aparecendo: ela também INFORMA a que departamento a equipe pertence, e
  // esconder fazia parecer que o filtro sumiu.
  if (departamentos.length === 0) return null;

  const pilula = (ativo: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      ativo
        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-500">Departamento:</span>
      <button onClick={() => onChange(null)} className={pilula(valor === null)}>
        Todos
      </button>
      {departamentos.map((d) => (
        <button
          key={d}
          onClick={() => onChange(valor === d ? null : d)}
          className={pilula(valor === d)}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
