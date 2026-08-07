'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Ban,
  Eye,
  Loader2,
  PenLine,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { aiAgentsService } from '../services/ai-agents.service';

/**
 * Ficha do agente para o ASSINANTE: o que este agente consegue fazer, em
 * português, com a explicação de cada item.
 *
 * Existe porque a resposta estava partida em três lugares e nenhum deles
 * respondia a pergunta: as habilidades viviam dentro do diálogo de edição (que
 * é pra editar, não pra entender), as ferramentas nativas só apareciam no
 * super-admin, e a aba de métricas mostrava o que o agente JÁ usou — histórico,
 * não catálogo.
 *
 * O corte principal não é leitura/escrita, é **roda sozinho** versus **pede
 * aprovação**: é essa a pergunta de quem decide quanta autonomia dar.
 */
export function AgentCapabilitiesDrawer({
  agentId,
  onClose,
}: {
  agentId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['agent-capabilities', agentId],
    queryFn: () => aiAgentsService.capabilities(agentId as string),
    enabled: !!agentId,
  });

  if (!agentId) return null;

  const sozinhas = (data?.skills ?? []).filter((s) => !s.pedeAprovacao);
  const comAprovacao = (data?.skills ?? []).filter((s) => s.pedeAprovacao);
  const nativas = (data?.builtin ?? []).filter((b) => b.disponivel);
  const foraDoAlcance = (data?.builtin ?? []).filter((b) => !b.disponivel);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-black">
        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {data?.agente.name ?? 'Carregando…'}
            </h2>
            <p className="text-xs text-zinc-500">
              {data?.agente.description?.trim() ||
                'O que este agente consegue fazer'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando as
              capacidades…
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {(error as any)?.response?.data?.message ??
                'Não consegui carregar o que este agente faz.'}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-2">
                <Numero valor={sozinhas.length + nativas.length} rotulo="Roda sozinho" />
                <Numero valor={comAprovacao.length} rotulo="Pede aprovação" />
                <Numero valor={data?.resumo.skillsTotal ?? 0} rotulo="Habilidades" />
              </div>

              <Bloco
                icone={ShieldCheck}
                titulo="Precisa da sua aprovação"
                explicacao="O agente prepara a ação, mas ela só acontece depois que alguém aprova no inbox. É onde ficam as decisões que mexem em dinheiro ou publicam em nome da empresa."
                vazio="Nada aqui — este agente não executa nenhuma ação que exija aprovação."
              >
                {comAprovacao.map((s) => (
                  <Item
                    key={s.nome}
                    nome={s.nome}
                    descricao={s.descricao}
                    marca={s.escreve ? 'escrita' : 'leitura'}
                  />
                ))}
              </Bloco>

              <Bloco
                icone={BadgeCheck}
                titulo="Roda sozinho"
                explicacao="Ações que o agente executa direto, sem parar pra perguntar."
                vazio="Nenhuma habilidade configurada roda sem aprovação."
              >
                {sozinhas.map((s) => (
                  <Item
                    key={s.nome}
                    nome={s.nome}
                    descricao={s.descricao}
                    marca={s.escreve ? 'escrita' : 'leitura'}
                  />
                ))}
              </Bloco>

              <Bloco
                icone={Sparkles}
                titulo="Ferramentas nativas"
                explicacao="Vêm com o AxChat e não precisam de configuração. O agente usa quando a tarefa pede."
                vazio="Nenhuma ferramenta nativa disponível para este agente."
              >
                {nativas.map((b) => (
                  <Item key={b.nome} nome={b.nome} descricao={b.descricao} />
                ))}
              </Bloco>

              {foraDoAlcance.length > 0 && (
                <details className="rounded-xl border border-zinc-200 dark:border-white/10">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    <span className="inline-flex items-center gap-2">
                      <Ban className="h-4 w-4 text-zinc-400" />
                      Fora do alcance deste agente ({foraDoAlcance.length})
                    </span>
                  </summary>
                  {/* Saber o que ele NÃO alcança é metade da resposta pra quem
                      está decidindo o papel de cada agente da equipe. */}
                  <div className="border-t border-zinc-100 px-4 py-3 dark:border-white/5">
                    <p className="mb-2 text-xs text-zinc-500">
                      Existem no AxChat, mas não estão disponíveis para este
                      agente — por causa do papel dele, do setor ou por serem
                      restritas a agentes específicos.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {foraDoAlcance.map((b) => (
                        <span
                          key={b.nome}
                          title={b.descricao}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-white/5 dark:text-zinc-400"
                        >
                          {b.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-center dark:border-white/10 dark:bg-white/5">
      <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {valor}
      </p>
      <p className="text-[11px] text-zinc-500">{rotulo}</p>
    </div>
  );
}

function Bloco({
  icone: Icone,
  titulo,
  explicacao,
  vazio,
  children,
}: {
  icone: React.ElementType;
  titulo: string;
  explicacao: string;
  vazio: string;
  children: React.ReactNode;
}) {
  const temItens = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <Icone className="h-4 w-4 shrink-0 text-primary" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {titulo}
        </h3>
      </div>
      <p className="mb-2 text-xs text-zinc-500">{explicacao}</p>
      {temItens ? (
        <ul className="space-y-1.5">{children}</ul>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-400 dark:border-white/10">
          {vazio}
        </p>
      )}
    </section>
  );
}

function Item({
  nome,
  descricao,
  marca,
}: {
  nome: string;
  descricao: string;
  marca?: 'leitura' | 'escrita';
}) {
  return (
    <li className="rounded-lg border border-zinc-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
          {nome}
        </span>
        {marca === 'escrita' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            <PenLine className="h-2.5 w-2.5" /> altera
          </span>
        )}
        {marca === 'leitura' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
            <Eye className="h-2.5 w-2.5" /> consulta
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {descricao}
      </p>
    </li>
  );
}
