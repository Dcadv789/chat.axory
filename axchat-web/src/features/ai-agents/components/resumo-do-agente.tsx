'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Crown,
  Loader2,
  Pencil,
  Power,
  PowerOff,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { aiAgentsService, type AiAgent } from '../services/ai-agents.service';
import { papelDoAgente } from '../avatar-do-agente';
import { departamentoVisivel } from '../rotulo-departamento';
import { AvatarAgente } from './avatar-agente';

/**
 * Ficha do agente no organograma, em diálogo centralizado.
 *
 * Clicar num nó abria direto o formulário de edição — resposta errada pra
 * pergunta errada. Quem clica no organograma quer entender a estrutura, não
 * preencher campo. Esta ficha responde "quem é esse e o que ele faz", e deixa
 * a edição a um clique.
 *
 * Editar leva pra visão de Departamentos com o formulário já aberto, em vez de
 * abrir outro formulário aqui: uma edição só, num lugar só.
 */
export function ResumoDoAgente({
  agent,
  onFechar,
  onEditar,
  onVerCapacidades,
  onToggleActive,
}: {
  agent: AiAgent;
  onFechar: () => void;
  onEditar: (agent: AiAgent) => void;
  onVerCapacidades: (agent: AiAgent) => void;
  onToggleActive: (agent: AiAgent) => void;
}) {
  // Mesma queryKey do painel de detalhe: se você já abriu o agente na visão de
  // Departamentos, isto vem do cache e não custa requisição nenhuma.
  const { data, isLoading } = useQuery({
    queryKey: ['agent-capabilities', agent.id],
    queryFn: () => aiAgentsService.capabilities(agent.id),
  });

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  const dep = departamentoVisivel(agent.department, agent.sector);
  const skills = (data?.skills ?? []).filter((s) => s.temAcesso);
  const nativas = (data?.builtin ?? []).filter((b) => b.disponivel);
  const pedemAprovacao = skills.filter((s) => s.pedeAprovacao);
  const subordinados = data?.agente?.subordinates ?? [];
  const canais = data?.agente?.channels ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onFechar}
      />

      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        <div className="flex items-start gap-4 border-b border-zinc-200 px-6 py-5 dark:border-white/10">
          <AvatarAgente
            nome={agent.name}
            avatarUrl={agent.avatarUrl}
            tamanho="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {agent.name}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                {agent.kind === 'ORCHESTRATOR' ? (
                  <Crown className="h-2.5 w-2.5" />
                ) : (
                  <Wrench className="h-2.5 w-2.5" />
                )}
                {papelDoAgente(agent.kind)}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  agent.isActive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
                }`}
              >
                {agent.isActive ? (
                  <>
                    <Power className="h-2.5 w-2.5" /> Ativo
                  </>
                ) : (
                  <>
                    <PowerOff className="h-2.5 w-2.5" /> Pausado
                  </>
                )}
              </span>
              {dep && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  {dep}
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
              {agent.modelId}
            </p>
          </div>
          <button
            onClick={onFechar}
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
            title="Fechar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              O que este agente faz
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {agent.description?.trim() ||
                (agent.kind === 'ORCHESTRATOR'
                  ? 'Sem descrição cadastrada. Como orquestrador, ele recebe as conversas do setor primeiro e decide quem resolve.'
                  : 'Sem descrição cadastrada. Como especialista, ele entra em ação quando o orquestrador delega uma conversa.')}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {agent.canRespondDirectly
                ? 'Pode responder ao cliente por conta própria.'
                : 'Não fala com o cliente: prepara a resposta e devolve para quem delegou.'}
            </p>
          </section>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {isLoading ? (
              <div className="col-span-3 flex items-center gap-2 py-3 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando o que
                ele alcança…
              </div>
            ) : (
              <>
                <Numero
                  valor={skills.length + nativas.length}
                  rotulo="Ações que executa"
                />
                <Numero
                  valor={pedemAprovacao.length}
                  rotulo="Pedem aprovação"
                />
                <Numero valor={canais.length} rotulo="Canais" />
              </>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Cartao icone={Users} titulo="Na equipe">
              <Linha
                rotulo="Reporta a"
                valor={data?.agente?.parent?.name ?? 'Ninguém (é a raiz)'}
              />
              <Linha
                rotulo="Comanda"
                valor={
                  subordinados.length === 0
                    ? 'Nenhum agente'
                    : subordinados.map((s) => s.name).join(', ')
                }
              />
            </Cartao>

            <Cartao icone={Radio} titulo="Canais onde atua">
              {canais.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Nenhum. Ele não recebe conversa — só age por delegação ou por
                  agendamento.
                </p>
              ) : (
                <ul className="space-y-1">
                  {canais.map((c) => (
                    <li
                      key={c.channel.id}
                      className="truncate text-xs text-zinc-700 dark:text-zinc-300"
                    >
                      {c.channel.name}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>

          {skills.length > 0 && (
            <section className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary dark:text-[#8ab4ff]" />
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Habilidades ({skills.length})
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span
                    key={s.id}
                    title={s.descricao}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] ${
                      s.pedeAprovacao
                        ? 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                    }`}
                  >
                    {s.pedeAprovacao && <ShieldCheck className="h-2.5 w-2.5" />}
                    {s.nome}
                  </span>
                ))}
              </div>
            </section>
          )}

          {agent.operationalContext?.trim() && (
            <section className="mt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Contexto operacional
              </h3>
              <pre className="mt-1.5 whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                {agent.operationalContext}
              </pre>
            </section>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-200 px-6 py-3 dark:border-white/10">
          <button
            onClick={() => onEditar(agent)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button
            onClick={() => onVerCapacidades(agent)}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <Sparkles className="h-4 w-4" /> Ficha completa
          </button>
          <button
            onClick={() => onToggleActive(agent)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            {agent.isActive ? (
              <>
                <PowerOff className="h-4 w-4" /> Pausar
              </>
            ) : (
              <>
                <Power className="h-4 w-4" /> Ativar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-center dark:border-white/10 dark:bg-white/[0.06]">
      <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {valor}
      </p>
      <p className="text-[11px] text-zinc-500">{rotulo}</p>
    </div>
  );
}

function Cartao({
  icone: Icone,
  titulo,
  children,
}: {
  icone: React.ElementType;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-white/10">
      <div className="mb-1.5 flex items-center gap-2">
        <Icone className="h-3.5 w-3.5 shrink-0 text-primary dark:text-[#8ab4ff]" />
        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          {titulo}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-0.5 text-xs">
      <span className="shrink-0 text-zinc-500">{rotulo}</span>
      <span className="min-w-0 text-right text-zinc-800 dark:text-zinc-200">
        {valor}
      </span>
    </div>
  );
}
