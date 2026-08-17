'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ChevronRight, Crown, Sparkles, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { aiAgentsService, type AiAgent, type AgentSector } from '../services/ai-agents.service';
import { agentSectorsService } from '../services/agent-sectors.service';
import { filterAgentsForSectorCards } from './agents-sector-utils';
import { useOrgId } from '@/hooks/use-org-query-key';
import { AgentDetailPanel } from './agent-detail-panel';
import { AvatarAgente } from './avatar-agente';
import {
  departamentoNaoSepara,
  departamentoVisivel,
} from '../rotulo-departamento';

/**
 * Visão de SETORES: lista à esquerda agrupada por setor, detalhe à direita —
 * o mesmo desenho da tela de Canais.
 *
 * Antes esta visão era uma grade de cartões: pra ver ou mexer num agente era
 * preciso clicar e cair num diálogo por cima da tela. Aqui o detalhe fica na
 * própria página e trocar de agente é um clique na lista.
 *
 * O organograma continua sendo o organograma (`AgentsList`) — ele existe pra
 * mostrar HIERARQUIA, que é uma pergunta diferente de "o que este agente faz".
 */
export function AgentsSplitView({
  agentSector,
  deptFilter = null,
  abrirAgenteId = null,
  abrirEditando = false,
  onAberto,
}: {
  agentSector?: AgentSector;
  deptFilter?: string | null;
  /** Agente que veio do organograma pelo botão Editar. */
  abrirAgenteId?: string | null;
  abrirEditando?: boolean;
  /** Avisa a página que já abriu, pra ela não reabrir a cada render. */
  onAberto?: () => void;
}) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [editarAoAbrir, setEditarAoAbrir] = useState(false);

  // Veio do organograma: seleciona o agente e já entra em edição.
  useEffect(() => {
    if (!abrirAgenteId) return;
    setSelecionado(abrirAgenteId);
    setEditarAoAbrir(abrirEditando);
    onAberto?.();
  }, [abrirAgenteId, abrirEditando, onAberto]);

  const { data: agents, isLoading: carregandoAgentes } = useQuery({
    queryKey: ['ai-agents', orgId, agentSector ?? 'all'],
    queryFn: () => aiAgentsService.list(agentSector),
  });

  const { data: sectors = [], isLoading: carregandoSetores } = useQuery({
    queryKey: ['agent-sectors'],
    queryFn: () => agentSectorsService.list(),
  });

  const isLoading = carregandoAgentes || carregandoSetores;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    queryClient.invalidateQueries({ queryKey: ['agent-sectors'] });
  };

  const filtrados = useMemo(
    () =>
      (agents ?? []).filter((a) => !deptFilter || a.department === deptFilter),
    [agents, deptFilter],
  );

  // Orquestrador primeiro dentro de cada setor: é a raiz da equipe, e ver o
  // chefe no topo é o que faz o grupo ler como time em vez de saco de agentes.
  const ordenar = (lista: AiAgent[]) =>
    [...lista].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'ORCHESTRATOR' ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

  const grupos = useMemo(() => {
    const comSetor = sectors
      .map((s) => ({
        id: s.id,
        nome: s.name,
        cor: s.color ?? '#8b5cf6',
        agentes: ordenar(
          filterAgentsForSectorCards(filtrados, sectors, s.id),
        ),
      }))
      .filter((g) => g.agentes.length > 0);

    const soltos = ordenar(
      filterAgentsForSectorCards(filtrados, sectors, 'unassigned'),
    );
    if (soltos.length > 0) {
      comSetor.push({
        id: '__sem_setor__',
        // Zero setores cadastrados não é "todo mundo sem setor" — é que a
        // organização ainda não criou nenhum. Chamar de "Sem setor" nesse caso
        // dava a impressão de que a tela estava quebrada.
        nome: sectors.length === 0 ? 'Todos os agentes' : 'Sem setor',
        cor: '#a1a1aa',
        agentes: soltos,
      });
    }
    return comSetor;
  }, [filtrados, sectors]);

  const total = grupos.reduce((n, g) => n + g.agentes.length, 0);

  // Quando todo departamento é só o eco da frente (dentro de Marketing, todos
  // se chamam "MARKETING"), agrupar não separa nada: sobra um cabeçalho
  // repetindo o nome da tela em cima de uma lista única. Nesse caso a lista
  // fica plana, sem cabeçalho nenhum.
  const agrupar = !departamentoNaoSepara(
    grupos.map((g) => g.nome),
    agentSector,
  );
  const agenteAberto =
    filtrados.find((a) => a.id === selecionado) ?? null;

  const alternarAtivo = async (agent: AiAgent) => {
    try {
      await aiAgentsService.update(agent.id, { isActive: !agent.isActive });
      toast.success(agent.isActive ? 'Agente pausado' : 'Agente ativado');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alternar');
    }
  };

  return (
    <div className="flex w-full items-start gap-4 px-4 pb-6">
      <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-black">
        <div className="border-b border-zinc-200 px-3 py-2.5 dark:border-white/10">
          <p className="text-xs font-medium text-zinc-500">
            {isLoading
              ? 'carregando…'
              : `${total} ${total === 1 ? 'agente' : 'agentes'}`}
          </p>
        </div>

        <div className="max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin p-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5"
                />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="h-9 w-9 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-xs text-zinc-500">
                {deptFilter
                  ? `Nenhum agente em ${deptFilter}.`
                  : 'Nenhum agente cadastrado.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {grupos.map((g) => (
                <div key={g.id}>
                  {agrupar && (
                    <div className="mb-1 flex items-center gap-2 px-2 pt-2">
                      <span
                        className="h-3 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: g.cor }}
                      />
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {departamentoVisivel(g.nome, agentSector) ?? g.nome}
                      </span>
                      <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-1.5 text-[10px] font-medium tabular-nums text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                        {g.agentes.length}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {g.agentes.map((a) => {
                      const ativo = selecionado === a.id;
                      const Icone = a.kind === 'ORCHESTRATOR' ? Crown : Wrench;
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSelecionado(a.id)}
                          className={`relative flex w-full items-center gap-3 rounded-lg py-2.5 pl-4 pr-3 text-left transition-colors ${
                            ativo
                              ? 'bg-primary/[0.07] font-medium text-primary dark:text-[#8ab4ff] before:absolute before:left-0 before:top-1/2 before:h-7 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-primary dark:before:bg-[#8ab4ff] dark:bg-primary/15'
                              : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.07]'
                          }`}
                        >
                          <AvatarAgente
                            nome={a.name}
                            avatarUrl={a.avatarUrl}
                            tamanho="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {a.name}
                              </span>
                              <span
                                title={a.isActive ? 'Ativo' : 'Pausado'}
                                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                                  a.isActive
                                    ? 'bg-emerald-500'
                                    : 'bg-zinc-300 dark:bg-zinc-600'
                                }`}
                              />
                            </div>
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {departamentoVisivel(a.department, agentSector) ??
                                (a.kind === 'ORCHESTRATOR'
                                  ? 'Orquestrador'
                                  : 'Agente')}
                            </p>
                          </div>
                          {ativo && (
                            <ChevronRight className="h-4 w-4 shrink-0 text-primary dark:text-[#8ab4ff]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        {!isLoading && sectors.length === 0 && total > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Nenhum setor criado ainda
            </p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300/90">
              Setores agrupam agentes por frente de trabalho. Enquanto não
              existir nenhum, todos aparecem juntos na lista. Crie em
              Configurações → Geral → Setores.
            </p>
          </div>
        )}

        {agenteAberto ? (
          <AgentDetailPanel
            key={agenteAberto.id}
            agent={agenteAberto}
            onUpdate={refresh}
            onToggleActive={alternarAtivo}
            iniciarEditando={editarAoAbrir}
            onSairDaEdicao={() => setEditarAoAbrir(false)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 py-20 text-center dark:border-white/10">
            <Sparkles className="h-14 w-14 text-zinc-200 dark:text-zinc-700" />
            <h2 className="mt-4 text-lg font-semibold text-zinc-500 dark:text-zinc-400">
              Selecione um agente
            </h2>
            <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
              Escolha um agente à esquerda para ver o que ele faz e configurá-lo
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
