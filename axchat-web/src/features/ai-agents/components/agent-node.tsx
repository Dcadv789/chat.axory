'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Sparkles, Power, PowerOff } from 'lucide-react';
import {
  type AiAgent,
  DEPARTMENT_COLORS,
} from '../services/ai-agents.service';
import { departamentoVisivel } from '../rotulo-departamento';
import { AvatarAgente } from './avatar-agente';
import { papelDoAgente } from '../avatar-do-agente';

// React Flow v12 requires node data to be assignable to Record<string,unknown>.
export type AgentNodeData = {
  agent: AiAgent;
  onClick: (agent: AiAgent) => void;
  onToggleActive: (agent: AiAgent) => void;
  onVerCapacidades: (agent: AiAgent) => void;
} & Record<string, unknown>;

/**
 * Custom React Flow node rendering an AgentCard. Identical visual to the
 * legacy grid card so users still recognize it — only difference is React
 * Flow connection handles top/bottom and a department-tinted ring/badge.
 */
function AgentNodeBase({ data }: { data: AgentNodeData }) {
  const { agent, onClick, onToggleActive, onVerCapacidades } = data;
  const isOrchestrator = agent.kind === 'ORCHESTRATOR';
  const dept = agent.department && DEPARTMENT_COLORS[agent.department];

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-zinc-300 !bg-zinc-400 dark:!border-zinc-600"
      />
      <button
        onClick={() => onClick(agent)}
        className={`group flex w-[360px] flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:bg-black ${
          isOrchestrator
            ? 'border-primary/40 ring-1 ring-primary/10 dark:border-primary/30'
            : dept
              ? `border-zinc-200 ring-1 ${dept.ring} dark:border-white/10`
              : 'border-zinc-200 dark:border-white/10'
        }`}
      >
        <div className="flex w-full items-start gap-3">
          <AvatarAgente
            nome={agent.name}
            avatarUrl={agent.avatarUrl}
            tamanho="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                {agent.name}
              </p>
              <div className="flex shrink-0 items-center gap-1">
              {/* Clicar no cartão abre a FICHA, não o formulário: quem clica no
                  organograma quer entender a estrutura. */}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onVerCapacidades(agent);
                }}
                title="Ver o que este agente consegue fazer"
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-[#8ab4ff]"
              >
                <Sparkles className="h-3 w-3" /> O que faz
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleActive(agent);
                }}
                title={agent.isActive ? 'Pausar agente' : 'Ativar agente'}
                className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                  agent.isActive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
                }`}
              >
                {agent.isActive ? (
                  <>
                    <Power className="h-3 w-3" /> Ativo
                  </>
                ) : (
                  <>
                    <PowerOff className="h-3 w-3" /> Pausado
                  </>
                )}
              </span>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                  isOrchestrator
                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#8ab4ff]'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300'
                }`}
              >
                {papelDoAgente(agent.kind)}
              </span>
              {departamentoVisivel(agent.department, agent.sector) && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    dept
                      ? `${dept.bg} ${dept.text}`
                      : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                  }`}
                >
                  {departamentoVisivel(agent.department, agent.sector)}
                </span>
              )}
              <span className="truncate font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                {agent.modelId}
              </span>
            </div>
          </div>
        </div>

        {/* Largura INTEIRA do cartão. Enquanto isto vivia na coluna ao lado do
            avatar, o texto quebrava num filete estreito e sobrava um vazio
            enorme à direita, onde só havia dois chips. */}
        {agent.description && (
          <p className="mt-3 line-clamp-4 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {agent.description}
          </p>
        )}

        {agent.channels && agent.channels.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {agent.channels.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-white/10 dark:text-zinc-300"
            >
              {c.channel.name}
              <span className="text-zinc-400">· {c.mode.toLowerCase()}</span>
            </span>
          ))}
        </div>
        )}
      </button>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-zinc-300 !bg-zinc-400 dark:!border-zinc-600"
      />
    </div>
  );
}

export const AgentNode = memo(AgentNodeBase);
