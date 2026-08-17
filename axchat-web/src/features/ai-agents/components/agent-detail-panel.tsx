'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Ban,
  Check,
  Crown,
  Eye,
  FileText,
  Info,
  Loader2,
  Lock,
  Pencil,
  PenLine,
  Power,
  PowerOff,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import {
  aiAgentsService,
  type AiAgent,
  type CapabilitySkill,
} from '../services/ai-agents.service';
import { useAuthStore } from '@/stores/auth-store';
import { departamentoVisivel } from '../rotulo-departamento';
import { AgentInlineForm } from './agent-inline-form';
import { AvatarAgente } from './avatar-agente';

type Aba = 'visao' | 'skills' | 'tools' | 'instrucoes';

const ABAS: Array<{ id: Aba; label: string; icone: React.ElementType }> = [
  { id: 'visao', label: 'Visão geral', icone: Info },
  { id: 'skills', label: 'Habilidades', icone: Sparkles },
  { id: 'tools', label: 'Ferramentas', icone: Wrench },
  { id: 'instrucoes', label: 'Instruções', icone: FileText },
];

/**
 * Detalhe do agente NA PRÓPRIA PÁGINA, ao lado da lista — mesmo desenho do
 * painel de canais.
 *
 * Abre já mostrando o que o agente FAZ, não os campos de configuração: a
 * pergunta de quem clica num agente é "o que este aqui resolve?", e a resposta
 * estava escondida atrás de um botão de editar. Configurar continua existindo,
 * num diálogo, porque é a ação rara.
 */
export function AgentDetailPanel({
  agent,
  onUpdate,
  onToggleActive,
  iniciarEditando = false,
  onSairDaEdicao,
}: {
  agent: AiAgent;
  onUpdate: () => void;
  onToggleActive: (agent: AiAgent) => void;
  /** Chegou aqui pelo botão Editar do organograma. */
  iniciarEditando?: boolean;
  onSairDaEdicao?: () => void;
}) {
  const [editando, setEditando] = useState(iniciarEditando);
  const [aba, setAba] = useState<Aba>('visao');

  const { data: bruto, isLoading, isError, error } = useQuery({
    queryKey: ['agent-capabilities', agent.id],
    queryFn: () => aiAgentsService.capabilities(agent.id),
  });

  // O React Query entrega o cache ANTES de revalidar. Numa aba aberta desde
  // antes de um deploy, esse primeiro render recebe o formato antigo da
  // resposta — sem os campos que a versão nova acrescentou — e qualquer
  // `.length` direto explode antes do refetch chegar. Normalizar aqui é o que
  // impede a tela inteira de cair por causa de um campo que ainda vai chegar.
  const data = useMemo(() => (bruto ? normalizar(bruto) : undefined), [bruto]);

  const Icone = agent.kind === 'ORCHESTRATOR' ? Crown : Wrench;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-black">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarAgente
            nome={agent.name}
            avatarUrl={agent.avatarUrl}
            tamanho="md"
          />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {agent.name}
            </h2>
            <p className="truncate text-xs text-zinc-500">
              {agent.description?.trim() ||
                (agent.kind === 'ORCHESTRATOR'
                  ? 'Orquestrador da equipe'
                  : 'Agente especialista')}
              {departamentoVisivel(agent.department, agent.sector)
                ? ` · ${departamentoVisivel(agent.department, agent.sector)}`
                : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onToggleActive(agent)}
            title={agent.isActive ? 'Pausar agente' : 'Ativar agente'}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
              agent.isActive
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400'
                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400'
            }`}
          >
            {agent.isActive ? (
              <>
                <Power className="h-3.5 w-3.5" /> Ativo
              </>
            ) : (
              <>
                <PowerOff className="h-3.5 w-3.5" /> Pausado
              </>
            )}
          </button>
          {agent.isManaged && (
            <span
              title="Agente do produto: o texto de instrução é mantido pela Axory e recebe melhorias automaticamente."
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
            >
              <BadgeCheck className="h-3 w-3" /> Do produto
            </span>
          )}
          <button
            onClick={() => {
              setAba('visao');
              setEditando((v) => !v);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
              editando
                ? 'border-primary/30 bg-primary/[0.06] text-primary dark:border-[#8ab4ff]/30 dark:text-[#8ab4ff]'
                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'
            }`}
          >
            <Pencil className="h-3.5 w-3.5" /> Configurar
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-zinc-200 px-4 dark:border-white/10">
        {ABAS.map((a) => {
          const ativa = aba === a.id;
          const contador =
            a.id === 'skills'
              ? data?.resumo.skillsTotal
              : a.id === 'tools'
                ? data?.resumo.builtinDisponiveis
                : undefined;
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                ativa
                  ? 'border-primary dark:border-[#8ab4ff] text-primary dark:text-[#8ab4ff]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <a.icone className="h-3.5 w-3.5" />
              {a.label}
              {contador !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    ativa
                      ? 'bg-primary/10 text-primary dark:text-[#8ab4ff] dark:bg-primary/20'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
                  }`}
                >
                  {contador}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="max-h-[calc(100vh-340px)] overflow-y-auto scrollbar-thin px-6 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando o que este
            agente faz…
          </div>
        ) : isError || !data ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {(error as any)?.response?.data?.message ??
              'Não consegui carregar o que este agente faz.'}
          </div>
        ) : aba === 'visao' ? (
          editando ? (
            <AgentInlineForm
              agent={agent}
              onCancelar={() => {
                setEditando(false);
                onSairDaEdicao?.();
              }}
              onSalvo={() => {
                setEditando(false);
                onSairDaEdicao?.();
                onUpdate();
              }}
            />
          ) : (
            <AbaVisaoGeral dados={data} />
          )
        ) : aba === 'skills' ? (
          <AbaHabilidades skills={data.skills} />
        ) : aba === 'tools' ? (
          <AbaFerramentas builtin={data.builtin} />
        ) : (
          <AbaInstrucoes dados={data} />
        )}
      </div>

    </div>
  );
}

/* ───────────────────────── Visão geral ───────────────────────── */

type Dados = NonNullable<
  Awaited<ReturnType<typeof aiAgentsService.capabilities>>
>;

/**
 * Preenche o que puder faltar numa resposta de versão anterior guardada em
 * cache. Só listas e contadores — texto ausente já é tratado onde é exibido.
 */
function normalizar(d: Dados): Dados {
  const cru = d.skills ?? [];
  // A resposta antiga trazia SÓ as skills ligadas e não tinha `temAcesso`.
  // Sem isto, um payload em cache apareceria com o catálogo inteiro marcado
  // como "sem acesso" — o oposto do que aquela lista significava.
  const formatoAntigo = cru.length > 0 && cru.every((s) => s.temAcesso === undefined);
  const skills = cru.map((s) => ({
    ...s,
    id: s.id ?? s.nome,
    temAcesso: formatoAntigo ? true : !!s.temAcesso,
  }));
  const builtin = d.builtin ?? [];
  return {
    ...d,
    skills,
    builtin,
    agente: {
      ...d.agente,
      subordinates: d.agente?.subordinates ?? [],
      channels: d.agente?.channels ?? [],
      parent: d.agente?.parent ?? null,
    },
    resumo: {
      ...d.resumo,
      skillsTotal: d.resumo?.skillsTotal ?? skills.filter((s) => s.temAcesso).length,
      skillsCatalogo: d.resumo?.skillsCatalogo ?? skills.length,
      skillsComAprovacao: d.resumo?.skillsComAprovacao ?? 0,
      builtinDisponiveis:
        d.resumo?.builtinDisponiveis ?? builtin.filter((b) => b.disponivel).length,
      builtinTotal: d.resumo?.builtinTotal ?? builtin.length,
    },
  };
}

/**
 * O papel do agente em português, não em enum. `kind` e `canRespondDirectly`
 * são os dois campos que decidem o comportamento no atendimento, mas ninguém
 * lê "ORCHESTRATOR + canRespondDirectly=false" e entende "ele triagem e passa
 * adiante, nunca responde sozinho".
 */
function explicarPapel(a: Dados['agente']): string {
  const orquestrador = a.kind === 'ORCHESTRATOR';
  const base = orquestrador
    ? 'Recebe as conversas do setor primeiro e decide quem resolve: responde ele mesmo ou passa pro especialista certo.'
    : 'Entra em ação quando o orquestrador delega uma conversa pra ele, ou quando um gatilho do canal aciona diretamente.';
  const resposta = a.canRespondDirectly
    ? 'Pode responder ao cliente por conta própria.'
    : 'Não fala com o cliente: prepara a resposta e devolve pra quem delegou.';
  return `${base} ${resposta}`;
}

function AbaVisaoGeral({ dados }: { dados: Dados }) {
  const a = dados.agente;
  const pedemAprovacao = dados.skills.filter(
    (s) => s.temAcesso && s.pedeAprovacao,
  );
  const sozinhas = dados.skills.filter((s) => s.temAcesso && !s.pedeAprovacao);
  const nativas = dados.builtin.filter((b) => b.disponivel);

  return (
    <div className="space-y-5">
      {/* A descrição é a primeira coisa que alguém quer ler, então ela abre a
          aba em vez de disputar espaço com os números. */}
      <section className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          {a.description?.trim() || 'Sem descrição cadastrada.'}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {explicarPapel(a)}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Numero
          icone={BadgeCheck}
          valor={sozinhas.length + nativas.length}
          rotulo="Roda sozinho"
          tom="verde"
        />
        <Numero
          icone={ShieldCheck}
          valor={pedemAprovacao.length}
          rotulo="Pede aprovação"
          tom="roxo"
        />
        <Numero
          icone={Sparkles}
          valor={`${dados.resumo.skillsTotal}/${dados.resumo.skillsCatalogo}`}
          rotulo="Habilidades ligadas"
          tom="neutro"
        />
      </div>

      {/* Duas colunas: à esquerda como ele age, à direita como está montado. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Cartao icone={ShieldCheck} titulo="Autonomia">
            <Linha
              rotulo="Ações sem aprovação"
              valor={`${sozinhas.length + nativas.length}`}
            />
            <Linha
              rotulo="Ações que pedem aprovação"
              valor={`${pedemAprovacao.length}`}
            />
            <Linha
              rotulo="Fala com o cliente"
              valor={a.canRespondDirectly ? 'Sim' : 'Não'}
            />
            {pedemAprovacao.length > 0 && (
              <Nota>
                O que pede aprovação só acontece depois que alguém aprova no
                inbox — é onde ficam as decisões que mexem em dinheiro ou
                publicam em nome da empresa.
              </Nota>
            )}
          </Cartao>

          <Cartao icone={Users} titulo="Na equipe">
            <Linha
              rotulo="Reporta a"
              valor={a.parent?.name ?? 'Ninguém (é a raiz)'}
            />
            <Linha rotulo="Departamento" valor={a.department ?? '—'} />
            {a.subordinates.length === 0 ? (
              <Linha rotulo="Comanda" valor="Nenhum agente" />
            ) : (
              <div className="pt-2">
                <p className="mb-1.5 text-xs text-zinc-500">
                  Comanda {a.subordinates.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.subordinates.map((s) => (
                    <span
                      key={s.id}
                      title={s.isActive ? 'Ativo' : 'Pausado'}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        s.isActive
                          ? 'bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200'
                          : 'bg-zinc-50 text-zinc-400 dark:bg-white/5 dark:text-zinc-500'
                      }`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          s.isActive
                            ? 'bg-emerald-500'
                            : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      />
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Cartao>
        </div>

        <div className="space-y-4">
          <Cartao icone={Radio} titulo="Canais onde atua">
            {a.channels.length === 0 ? (
              <Nota destaque>
                Nenhum canal. Ele não recebe conversa — só age quando outro
                agente delega, ou por agendamento.
              </Nota>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-white/5">
                {a.channels.map((c) => (
                  <li
                    key={c.channel.id}
                    className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0 truncate text-xs text-zinc-700 dark:text-zinc-300">
                      {c.channel.name}
                      <span className="ml-1.5 font-mono text-[10px] text-zinc-400">
                        {c.channel.type}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                      {c.mode === 'AUTONOMOUS' ? 'autônomo' : c.mode.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao icone={Wrench} titulo="Ficha técnica">
            <Linha
              rotulo="Papel"
              valor={a.kind === 'ORCHESTRATOR' ? 'Orquestrador' : 'Especialista'}
            />
            <Linha rotulo="Frente" valor={a.sector ?? '—'} />
            <Linha rotulo="Modelo" valor={a.modelId} mono />
            <Linha
              rotulo="Temperatura"
              valor={`${a.temperature} · ${
                a.temperature <= 0.3
                  ? 'previsível'
                  : a.temperature >= 0.8
                    ? 'criativo'
                    : 'equilibrado'
              }`}
            />
            <Linha rotulo="Máx. de tokens" valor={String(a.maxTokens)} />
            <Linha rotulo="Situação" valor={a.isActive ? 'Ativo' : 'Pausado'} />
          </Cartao>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Habilidades ───────────────────────── */

/**
 * O catálogo INTEIRO da organização, com as deste agente marcadas.
 *
 * Mostrar só as ligadas respondia "o que ele faz" mas deixava invisível o que
 * ele poderia fazer — e é justamente essa comparação que decide o que ligar.
 */
function AbaHabilidades({ skills }: { skills: CapabilitySkill[] }) {
  const [somenteDele, setSomenteDele] = useState(false);

  const grupos = useMemo(() => {
    const visiveis = somenteDele ? skills.filter((s) => s.temAcesso) : skills;
    const porCategoria = new Map<string, CapabilitySkill[]>();
    for (const s of visiveis) {
      const chave = s.categoria?.trim() || 'Sem categoria';
      const atual = porCategoria.get(chave) ?? [];
      atual.push(s);
      porCategoria.set(chave, atual);
    }
    // Dentro da categoria, as do agente primeiro: quem abre esta aba quer ver
    // o que ele tem, e o resto do catálogo é referência.
    return [...porCategoria.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([categoria, itens]) => ({
        categoria,
        itens: [...itens].sort((x, y) =>
          x.temAcesso === y.temAcesso
            ? x.nome.localeCompare(y.nome, 'pt-BR')
            : x.temAcesso
              ? -1
              : 1,
        ),
      }));
  }, [skills, somenteDele]);

  const ligadas = skills.filter((s) => s.temAcesso).length;

  if (skills.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400 dark:border-white/10">
        Nenhuma habilidade cadastrada na organização. Crie em Agentes → Skills.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {ligadas} de {skills.length}
          </span>{' '}
          habilidades da organização estão ligadas neste agente. As demais
          existem, mas ele não alcança.
        </p>
        <button
          onClick={() => setSomenteDele((v) => !v)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            somenteDele
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
          }`}
        >
          {somenteDele ? 'Mostrando só as dele' : 'Mostrar só as dele'}
        </button>
      </div>

      {grupos.map((g) => (
        <section key={g.categoria}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {g.categoria}
          </h3>
          <div className="grid gap-2 lg:grid-cols-2">
            {g.itens.map((s) => (
              <ItemSkill key={s.id} skill={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ItemSkill({ skill: s }: { skill: CapabilitySkill }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        s.temAcesso
          ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/[0.06]'
          : 'border-zinc-100 bg-zinc-50/60 dark:border-white/10 dark:bg-white/[0.02]'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          title={s.temAcesso ? 'Este agente tem acesso' : 'Sem acesso'}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${
            s.temAcesso
              ? 'bg-emerald-500 text-white'
              : 'border border-zinc-300 text-zinc-300 dark:border-white/15 dark:text-zinc-600'
          }`}
        >
          {s.temAcesso ? (
            <Check className="h-3 w-3" />
          ) : (
            <Lock className="h-2.5 w-2.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`font-mono text-xs font-medium ${
                s.temAcesso
                  ? 'text-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {s.nome}
            </span>
            <Marca escreve={s.escreve} />
            {s.temAcesso && s.pedeAprovacao && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                <ShieldCheck className="h-2.5 w-2.5" /> aprovação
              </span>
            )}
          </div>
          <p
            className={`mt-0.5 text-xs ${
              s.temAcesso
                ? 'text-zinc-600 dark:text-zinc-400'
                : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            {s.descricao}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Ferramentas ───────────────────────── */

function AbaFerramentas({
  builtin,
}: {
  builtin: Array<{ nome: string; descricao: string; disponivel: boolean }>;
}) {
  const disponiveis = builtin.filter((b) => b.disponivel);
  const fora = builtin.filter((b) => !b.disponivel);

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-1 flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 shrink-0 text-primary dark:text-[#8ab4ff]" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Disponíveis ({disponiveis.length})
          </h3>
        </div>
        <p className="mb-2 text-xs text-zinc-500">
          Vêm com o AxChat e não precisam de configuração. O agente usa quando a
          tarefa pede.
        </p>
        {disponiveis.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-400 dark:border-white/10">
            Nenhuma ferramenta nativa disponível para este agente.
          </p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {disponiveis.map((b) => (
              <div
                key={b.nome}
                className="rounded-lg border border-zinc-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]"
              >
                <span className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {b.nome}
                </span>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {b.descricao}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {fora.length > 0 && (
        <section>
          <div className="mb-1 flex items-center gap-2">
            <Ban className="h-4 w-4 shrink-0 text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Fora do alcance ({fora.length})
            </h3>
          </div>
          <p className="mb-2 text-xs text-zinc-500">
            Existem no AxChat, mas não estão disponíveis para este agente — por
            causa do papel dele, do setor, ou por serem restritas a agentes
            específicos.
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            {fora.map((b) => (
              <div
                key={b.nome}
                className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]"
              >
                <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {b.nome}
                </span>
                <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                  {b.descricao}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ───────────────────────── Instruções ───────────────────────── */

function AbaInstrucoes({ dados }: { dados: Dados }) {
  const isSuperAdmin = useAuthStore((s) => !!s.user?.isSuperAdmin);
  const a = dados.agente;

  return (
    <div className="space-y-4">
      <Cartao icone={Sparkles} titulo="Contexto operacional">
        <p className="mb-2 text-xs text-zinc-500">
          O que está acontecendo na operação agora. Entra em toda conversa do
          agente — é aqui que você avisa promoção do dia, mudança de preço,
          campanha no ar.
        </p>
        {a.operationalContext?.trim() ? (
          <>
            <pre className="whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
              {a.operationalContext}
            </pre>
            {a.operationalContextUpdatedAt && (
              <p className="mt-1 text-[11px] text-zinc-400">
                Atualizado em{' '}
                {new Date(a.operationalContextUpdatedAt).toLocaleString('pt-BR')}
              </p>
            )}
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-400 dark:border-white/10">
            Vazio. Preencha em Configurar para dar contexto do dia a dia ao
            agente.
          </p>
        )}
      </Cartao>

      {/* O system prompt é a engenharia do produto, não configuração do
          assinante: fica só pro super-admin. */}
      {isSuperAdmin && (
        <Cartao icone={FileText} titulo="System prompt">
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
            {a.systemPrompt}
          </pre>
        </Cartao>
      )}
    </div>
  );
}

/* ───────────────────────── peças ───────────────────────── */

function Numero({
  icone: Icone,
  valor,
  rotulo,
  tom = 'neutro',
}: {
  icone: React.ElementType;
  valor: number | string;
  rotulo: string;
  tom?: 'verde' | 'roxo' | 'neutro';
}) {
  const cores = {
    verde:
      'border-emerald-200/70 bg-emerald-50/60 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
    roxo: 'border-violet-200/70 bg-violet-50/60 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300',
    neutro:
      'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300',
  }[tom];

  return (
    <div className={`rounded-xl border px-3 py-3 ${cores}`}>
      <Icone className="h-4 w-4 opacity-80" />
      <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">
        {valor}
      </p>
      <p className="mt-1 text-[11px] opacity-80">{rotulo}</p>
    </div>
  );
}

/** Recado curto dentro de um cartão. `destaque` = alerta, não rodapé. */
function Nota({
  children,
  destaque,
}: {
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${
        destaque
          ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
          : 'bg-zinc-50 text-zinc-500 dark:bg-white/5 dark:text-zinc-400'
      }`}
    >
      {children}
    </p>
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
    <section className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-white/10">
      <div className="mb-2 flex items-center gap-2">
        <Icone className="h-4 w-4 shrink-0 text-primary dark:text-[#8ab4ff]" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {titulo}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Linha({
  rotulo,
  valor,
  mono,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5 text-xs">
      <span className="shrink-0 text-zinc-500">{rotulo}</span>
      <span
        className={`min-w-0 text-right text-zinc-800 dark:text-zinc-200 ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        {valor}
      </span>
    </div>
  );
}

function Marca({ escreve }: { escreve: boolean }) {
  return escreve ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
      <PenLine className="h-2.5 w-2.5" /> altera
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
      <Eye className="h-2.5 w-2.5" /> consulta
    </span>
  );
}
