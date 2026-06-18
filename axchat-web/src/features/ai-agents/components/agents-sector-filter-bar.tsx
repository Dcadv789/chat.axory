'use client';

import type { AiAgent } from '../services/ai-agents.service';
import type { AgentSector } from '../services/agent-sectors.service';
import type { SectorFilter } from './agents-sector-utils';

interface AgentsSectorFilterBarProps {
  sectors: AgentSector[];
  agents: AiAgent[];
  selectedFilter: SectorFilter;
  onSelectFilter: (filter: SectorFilter) => void;
}

export function AgentsSectorFilterBar({
  sectors,
  agents,
  selectedFilter,
  onSelectFilter,
}: AgentsSectorFilterBarProps) {
  const unassignedCount = agents.filter(
    (a) => !sectors.some((s) => s.agents.some((l) => l.agent.id === a.id)),
  ).length;

  return (
    <div className="border-b border-zinc-200 px-6 py-4 dark:border-white/10">
      <div className="mb-3">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Setor de Operação
        </p>
        <p className="text-xs text-zinc-500">
          Escolha um setor — o filtro vale tanto na visão de setores quanto no organograma.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => onSelectFilter('all')}
          className={`rounded-xl border p-4 text-left transition-all ${
            selectedFilter === 'all'
              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
              : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-black dark:hover:border-white/20'
          }`}
        >
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Todos os setores
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Visão completa de todos os agentes cadastrados.
          </p>
          <p className="mt-2 text-[11px] font-medium text-zinc-400">
            {agents.length} agente{agents.length !== 1 ? 's' : ''}
          </p>
        </button>

        {sectors.map((sector) => {
          const agentCount = agents.filter((a) =>
            sector.agents.some((link) => link.agent.id === a.id),
          ).length;
          return (
            <button
              key={sector.id}
              type="button"
              onClick={() => onSelectFilter(sector.id)}
              className={`rounded-xl border p-4 text-left transition-all ${
                selectedFilter === sector.id
                  ? 'ring-2 ring-offset-1 dark:ring-offset-black'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-black dark:hover:border-white/20'
              }`}
              style={
                selectedFilter === sector.id
                  ? {
                      borderColor: sector.color ?? '#8b5cf6',
                      backgroundColor: `${sector.color ?? '#8b5cf6'}10`,
                      boxShadow: `0 0 0 2px ${sector.color ?? '#8b5cf6'}33`,
                    }
                  : undefined
              }
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: sector.color ?? '#8b5cf6' }}
                >
                  {sector.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {sector.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                    {sector.description || 'Sem descrição cadastrada.'}
                  </p>
                  <p className="mt-2 text-[11px] font-medium text-zinc-400">
                    {agentCount} agente{agentCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </button>
          );
        })}

        {unassignedCount > 0 && (
          <button
            type="button"
            onClick={() => onSelectFilter('unassigned')}
            className={`rounded-xl border p-4 text-left transition-all ${
              selectedFilter === 'unassigned'
                ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/20 dark:bg-amber-900/10'
                : 'border-dashed border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-white/10 dark:bg-black'
            }`}
          >
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Sem setor
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Agentes ainda não vinculados a nenhum setor de operação.
            </p>
            <p className="mt-2 text-[11px] font-medium text-zinc-400">
              {unassignedCount} agente{unassignedCount !== 1 ? 's' : ''}
            </p>
          </button>
        )}
      </div>
    </div>
  );
}
