'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { Bot, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  aiAgentsService,
  type AiAgent,
  DEPARTMENT_COLORS,
  type AgentSector,
} from '../services/ai-agents.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { CreateAgentDialog } from './create-agent-dialog';
import { ResumoDoAgente } from './resumo-do-agente';
import { AgentCapabilitiesDrawer } from './agent-capabilities-drawer';
import { AgentNode, type AgentNodeData } from './agent-node';

// Precisam bater com o tamanho REAL do cartão em `agent-node.tsx`: é com estes
// números que o dagre reserva espaço. Menor que o cartão = nós sobrepostos.
const NODE_WIDTH = 360;
const NODE_HEIGHT = 220;

const nodeTypes: NodeTypes = { agent: AgentNode };

/**
 * Computes top-down hierarchical positions for the agent organogram using
 * dagre. Nodes without a parent become roots; multiple roots stack
 * horizontally at depth 0. Department isn't fed into layout (would force
 * unrelated agents apart) — it's only a visual cue on each card.
 */
function layoutOrganogram(agents: AiAgent[]): {
  nodes: Node<AgentNodeData>[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    // Espaço entre nós irmãos (horizontal). Aumentar evita as edges
    // passarem por cima umas das outras quando 1 pai tem N filhos.
    nodesep: 100,
    // Espaço vertical entre níveis. Mais alto = mais "respiro" pras
    // linhas saírem retas antes de virar lateral.
    ranksep: 120,
    // Direciona o algoritmo a posicionar cada nó no centro do seu
    // pai (organograma "cartório") em vez de empilhar à esquerda.
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(agents.map((a) => a.id));

  for (const a of agents) {
    g.setNode(a.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const a of agents) {
    // Treat unknown parent as root (orphaned ref). Avoids broken edges
    // when an agent is hard-deleted but children weren't reparented.
    if (a.parentAgentId && ids.has(a.parentAgentId)) {
      g.setEdge(a.parentAgentId, a.id);
    }
  }

  dagre.layout(g);

  const nodes: Node<AgentNodeData>[] = agents.map((a) => {
    const pos = g.node(a.id);
    return {
      id: a.id,
      type: 'agent',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: {
        agent: a,
        // overwritten by AgentsList with real handlers
        onClick: () => {},
        onToggleActive: () => {},
        onVerCapacidades: () => {},
      },
      draggable: true,
    };
  });

  const edges: Edge[] = [];
  for (const a of agents) {
    if (a.parentAgentId && ids.has(a.parentAgentId)) {
      edges.push({
        id: `${a.parentAgentId}->${a.id}`,
        source: a.parentAgentId,
        target: a.id,
        // step (sem curvas) dá um L "engineering" tradicional pra
        // organograma; smoothstep com curvas faz N edges saindo do
        // mesmo handle se cruzarem visualmente perto do source.
        type: 'step',
        animated: false,
        style: { stroke: '#a1a1aa', strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

export function AgentsList({
  agentSector,
  deptFilter = null,
  abrirCriacao,
  onFecharCriacao,
  onEditarAgente,
}: {
  agentSector?: AgentSector;
  /** Departamento escolhido na barra de filtro da página. */
  deptFilter?: string | null;
  /** A criação é disparada pela barra, que fica fora deste componente. */
  abrirCriacao?: boolean;
  onFecharCriacao?: () => void;
  /** Editar não acontece aqui: leva pra visão de Departamentos, que é onde
      mora o formulário. Uma edição só, num lugar só. */
  onEditarAgente?: (agent: AiAgent) => void;
}) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [resumindo, setResumindo] = useState<AiAgent | null>(null);
  const [vendoCapacidades, setVendoCapacidades] = useState<AiAgent | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ['ai-agents', orgId, agentSector ?? 'all'],
    queryFn: () => aiAgentsService.list(agentSector),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['ai-agents'] });

  const handleToggleActive = async (agent: AiAgent) => {
    try {
      await aiAgentsService.update(agent.id, { isActive: !agent.isActive });
      toast.success(agent.isActive ? 'Agente desativado' : 'Agente ativado');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alternar');
    }
  };

  const filtered = useMemo(() => {
    if (!agents) return [];
    if (!deptFilter) return agents;
    return agents.filter((a) => a.department === deptFilter);
  }, [agents, deptFilter]);

  const { nodes, edges } = useMemo(() => {
    const out = layoutOrganogram(filtered);
    // inject real handlers (memoized layout doesn't know them)
    return {
      nodes: out.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onClick: setResumindo,
          onToggleActive: handleToggleActive,
          onVerCapacidades: setVendoCapacidades,
        },
      })),
      edges: out.edges,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const hasAgents = (agents?.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-[640px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-200 dark:bg-black" />
          </div>
        ) : hasAgents ? (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              className="bg-zinc-50 dark:bg-black"
            >
              <Background gap={24} size={1} color="#e4e4e7" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => {
                  const a = (n.data as AgentNodeData).agent;
                  if (a.kind === 'ORCHESTRATOR') return '#6366f1';
                  if (a.department === 'VENDAS') return '#10b981';
                  if (a.department === 'SUPORTE') return '#0047FF';
                  if (a.department === 'CS') return '#8b5cf6';
                  return '#a1a1aa';
                }}
                className="!bg-white dark:!bg-zinc-900"
              />
            </ReactFlow>
          </ReactFlowProvider>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-10">
            <div className="rounded-xl border-2 border-dashed border-zinc-200 p-16 dark:border-white/10">
              <Bot className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-center text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Nenhum agente cadastrado ainda
              </p>
              <p className="mt-1 max-w-md text-center text-xs text-zinc-400 dark:text-zinc-500">
                Crie um agente, dê a ele um system prompt e atribua a um canal —
                ele passa a responder automaticamente.
              </p>
              <p className="mt-4 text-xs text-zinc-400">
                Use o botão <strong>Novo agente</strong>, na barra acima.
              </p>
            </div>
          </div>
        )}
      </div>

      <CreateAgentDialog
        open={!!abrirCriacao}
        onClose={() => onFecharCriacao?.()}
        onCreated={refresh}
        defaultSector={agentSector}
      />
      <AgentCapabilitiesDrawer
        agentId={vendoCapacidades?.id ?? null}
        onClose={() => setVendoCapacidades(null)}
      />

      {resumindo && (
        <ResumoDoAgente
          agent={resumindo}
          onFechar={() => setResumindo(null)}
          onEditar={(a) => {
            setResumindo(null);
            onEditarAgente?.(a);
          }}
          onVerCapacidades={(a) => {
            setResumindo(null);
            setVendoCapacidades(a);
          }}
          onToggleActive={handleToggleActive}
        />
      )}
    </div>
  );
}
