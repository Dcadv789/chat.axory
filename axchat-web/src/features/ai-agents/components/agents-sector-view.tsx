'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Pencil, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { agentSectorsService, type AgentSector } from '../services/agent-sectors.service';
import { aiAgentsService, type AiAgent } from '../services/ai-agents.service';
import { filterAgentsForSectorCards } from './agents-sector-utils';
import { EditAgentDialog } from './edit-agent-dialog';
import { CreateAgentDialog } from './create-agent-dialog';
import { useOrgId } from '@/hooks/use-org-query-key';

interface AgentsSectorViewProps {
  agentSector?: 'ATENDIMENTO' | 'MARKETING';
}

function AgentCard({
  agent,
  onEdit,
  onToggleActive,
  dashed,
}: {
  agent: AiAgent;
  onEdit: () => void;
  onToggleActive: (agent: AiAgent) => void;
  dashed?: boolean;
}) {
  return (
    <div
      className={`group relative rounded-lg border p-4 transition-shadow hover:shadow-md ${
        dashed
          ? 'border-dashed border-zinc-300 bg-zinc-50 dark:border-white/10 dark:bg-black'
          : 'border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-black'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 shrink-0 rounded-full ${
                agent.isActive ? 'bg-emerald-500' : 'bg-zinc-300'
              }`}
            />
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {agent.name}
            </p>
          </div>
          {agent.department && (
            <p className="mt-1 truncate text-[11px] text-zinc-500">
              {agent.department}
              {agent.squad ? ` · ${agent.squad}` : ''}
            </p>
          )}
          <p className="mt-0.5 truncate text-[10px] font-mono text-zinc-400">
            {agent.modelId}
          </p>
          <p className="mt-0.5 text-[10px] capitalize text-zinc-400">
            {agent.kind.toLowerCase()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onToggleActive(agent)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
            title={agent.isActive ? 'Desativar' : 'Ativar'}
          >
            {agent.isActive ? (
              <PowerOff className="h-3.5 w-3.5" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentsSectorView({ agentSector }: AgentsSectorViewProps) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AiAgent | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: sectors = [], isLoading: sectorsLoading } = useQuery({
    queryKey: ['agent-sectors'],
    queryFn: () => agentSectorsService.list(),
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['ai-agents', orgId, agentSector ?? 'all'],
    queryFn: () => aiAgentsService.list(agentSector),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    queryClient.invalidateQueries({ queryKey: ['agent-sectors'] });
  };

  const handleToggleActive = async (agent: AiAgent) => {
    try {
      await aiAgentsService.update(agent.id, { isActive: !agent.isActive });
      toast.success(agent.isActive ? 'Agente desativado' : 'Agente ativado');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alternar');
    }
  };

  const unassigned = useMemo(
    () => filterAgentsForSectorCards(agents, sectors, 'unassigned'),
    [agents, sectors],
  );

  const isLoading = sectorsLoading || agentsLoading;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end px-6 py-3">
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo agente
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-200 dark:bg-black" />
          </div>
        ) : sectors.length === 0 && agents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-10">
            <div className="rounded-xl border-2 border-dashed border-zinc-200 p-16 dark:border-white/10">
              <Bot className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-center text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Nenhum agente cadastrado ainda
              </p>
              <p className="mt-1 max-w-md text-center text-xs text-zinc-400 dark:text-zinc-500">
                Crie agentes e organize-os em setores em Configurações &gt; IA &gt; Setores de Operação.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {sectors.map((sector) => {
              const sectorAgents = agents.filter((a) =>
                sector.agents.some((link) => link.agent.id === a.id),
              );
              if (sectorAgents.length === 0) return null;
              return (
                <SectorAgentsBlock
                  key={sector.id}
                  sector={sector}
                  agents={sectorAgents}
                  onEdit={setEditing}
                  onToggleActive={handleToggleActive}
                />
              );
            })}
            {unassigned.length > 0 && (
              <div>
                <SectorHeader
                  name="Sem setor"
                  description="Agentes ainda não vinculados a nenhum setor."
                  color="#a1a1aa"
                  count={unassigned.length}
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {unassigned.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      dashed
                      onEdit={() => setEditing(agent)}
                      onToggleActive={handleToggleActive}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={refresh}
        defaultSector={agentSector}
      />
      <EditAgentDialog
        agent={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
    </div>
  );
}

function SectorHeader({
  name,
  description,
  color,
  count,
}: {
  name: string;
  description: string;
  color: string;
  count: number;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{name}</h3>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
            {count} agente{count !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

function SectorAgentsBlock({
  sector,
  agents,
  onEdit,
  onToggleActive,
}: {
  sector: AgentSector;
  agents: AiAgent[];
  onEdit: (agent: AiAgent) => void;
  onToggleActive: (agent: AiAgent) => void;
}) {
  return (
    <div>
      <SectorHeader
        name={sector.name}
        description={sector.description || 'Setor sem descrição cadastrada.'}
        color={sector.color ?? '#8b5cf6'}
        count={agents.length}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onEdit={() => onEdit(agent)}
            onToggleActive={onToggleActive}
          />
        ))}
      </div>
    </div>
  );
}
