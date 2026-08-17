'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  aiAgentsService,
  type AiAgent,
  CURATED_MODELS,
} from '../services/ai-agents.service';
import { agentSectorsService } from '../services/agent-sectors.service';
import { AVATARES_PRONTOS } from '../avatar-do-agente';
import { AvatarAgente } from './avatar-agente';

/**
 * Edição do agente NA PRÓPRIA PÁGINA, no lugar onde o conteúdo já estava.
 *
 * Antes, "Configurar" abria um diálogo por cima da tela com tudo dentro. O
 * problema não era o diálogo em si: era perder de vista o que você estava
 * lendo. Você clica em configurar justamente porque viu algo no painel que
 * quer mudar — e a tela que mostrava esse algo some no instante do clique.
 *
 * Aqui os campos ocupam o mesmo espaço, na mesma ordem, com os mesmos títulos.
 * O que era leitura vira escrita, sem trocar de contexto.
 */
export function AgentInlineForm({
  agent,
  onCancelar,
  onSalvo,
}: {
  agent: AiAgent;
  onCancelar: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(agent.name);
  const [avatar, setAvatar] = useState(agent.avatarUrl ?? '');
  const [descricao, setDescricao] = useState(agent.description ?? '');
  const [modelId, setModelId] = useState(agent.modelId);
  const [temperatura, setTemperatura] = useState(agent.temperature);
  const [maxTokens, setMaxTokens] = useState(agent.maxTokens);
  const [respondeDireto, setRespondeDireto] = useState(agent.canRespondDirectly);
  const [contexto, setContexto] = useState(agent.operationalContext ?? '');
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const [extras, setExtras] = useState(agent.additionalInstructions ?? '');
  const [paiId, setPaiId] = useState(agent.parentAgentId ?? '');
  const [departamentoId, setDepartamentoId] = useState<string>('');
  const [salvando, setSalvando] = useState(false);

  const { data: departamentos = [] } = useQuery({
    queryKey: ['agent-sectors'],
    queryFn: () => agentSectorsService.list(),
  });

  const { data: todos = [] } = useQuery({
    queryKey: ['ai-agents', 'todos-para-chefia'],
    queryFn: () => aiAgentsService.list(),
  });

  // O departamento atual vem do vínculo, não do texto — o texto é derivado.
  useEffect(() => {
    const atual = departamentos.find((d) =>
      d.agents.some((l) => l.agent.id === agent.id),
    );
    setDepartamentoId(atual?.id ?? '');
  }, [departamentos, agent.id]);

  // Chefia só faz sentido dentro da mesma frente: um orquestrador de marketing
  // não comanda um agente de atendimento — o roteador nem deixaria delegar.
  const possiveisChefes = todos.filter(
    (a) => a.id !== agent.id && a.sector === agent.sector,
  );

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error('O agente precisa de um nome.');
      return;
    }
    setSalvando(true);
    try {
      await aiAgentsService.update(agent.id, {
        name: nome.trim(),
        avatarUrl: avatar || null,
        description: descricao.trim() || undefined,
        modelId,
        temperature: temperatura,
        maxTokens,
        canRespondDirectly: respondeDireto,
        parentAgentId: paiId || null,
        operationalContext: contexto.trim() || null,
        additionalInstructions: extras.trim() || null,
        // Agente do produto: o prompt é mantido pela Axory e o backend recusa
        // a alteração. Nem mandamos o campo — assim um formulário que envia
        // tudo não quebra o salvar dos outros campos.
        ...(agent.isManaged ? {} : { systemPrompt: prompt }),
        department:
          departamentos.find((d) => d.id === departamentoId)?.name ?? null,
      });

      // Vínculo de departamento: um só. Tira dos outros antes de pôr no novo,
      // senão o agente aparece em duas colunas da visão de departamentos.
      const atuais = departamentos
        .filter((d) => d.agents.some((l) => l.agent.id === agent.id))
        .map((d) => d.id);
      for (const id of atuais) {
        if (id !== departamentoId) {
          try {
            await agentSectorsService.removeAgent(id, agent.id);
          } catch {
            /* vínculo já podia não existir */
          }
        }
      }
      if (departamentoId && !atuais.includes(departamentoId)) {
        await agentSectorsService.addAgent(departamentoId, agent.id);
      }

      toast.success('Agente atualizado');
      onSalvo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-2.5 dark:border-[#8ab4ff]/25 dark:bg-primary/10">
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          Editando <strong>{agent.name}</strong>. As habilidades e ferramentas
          continuam nas abas ao lado.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onCancelar}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {salvando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Salvar
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Bloco titulo="O que este agente faz">
            <Campo rotulo="Carinha">
              <div className="flex items-center gap-3">
                <AvatarAgente nome={nome} avatarUrl={avatar} tamanho="lg" />
                <div className="flex flex-wrap gap-1">
                  {/* "Sem carinha" não é ausência de avatar: cai nas iniciais
                      coloridas, que já diferenciam um agente do outro. */}
                  <button
                    type="button"
                    onClick={() => setAvatar('')}
                    title="Usar as iniciais do nome"
                    className={`h-7 rounded-md border px-2 text-[10px] font-medium ${
                      !avatar
                        ? 'border-primary bg-primary/10 text-primary dark:border-[#8ab4ff] dark:text-[#8ab4ff]'
                        : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5'
                    }`}
                  >
                    AB
                  </button>
                  {AVATARES_PRONTOS.map((e) => {
                    const valor = `emoji:${e}`;
                    const ativo = avatar === valor;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setAvatar(ativo ? '' : valor)}
                        className={`h-7 w-7 rounded-md border text-base leading-none ${
                          ativo
                            ? 'border-primary bg-primary/10 dark:border-[#8ab4ff]'
                            : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5'
                        }`}
                      >
                        {e}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Campo>
            <Campo rotulo="Nome">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={INPUT}
              />
            </Campo>
            <Campo rotulo="Descrição">
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                placeholder="Em uma frase: que problema este agente resolve?"
                className={INPUT}
              />
            </Campo>
          </Bloco>

          <Bloco titulo="Autonomia">
            <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={respondeDireto}
                onChange={(e) => setRespondeDireto(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-white/20"
              />
              <span>
                Fala com o cliente
                <span className="mt-0.5 block text-[11px] text-zinc-500">
                  Desligado, ele prepara a resposta e devolve para quem delegou.
                </span>
              </span>
            </label>
          </Bloco>

          <Bloco titulo="Na equipe">
            <Campo rotulo="Reporta a">
              <select
                value={paiId}
                onChange={(e) => setPaiId(e.target.value)}
                className={INPUT}
              >
                <option value="">— Ninguém (é a raiz) —</option>
                {possiveisChefes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Departamento">
              <select
                value={departamentoId}
                onChange={(e) => setDepartamentoId(e.target.value)}
                className={INPUT}
              >
                <option value="">— Sem departamento —</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Campo>
          </Bloco>
        </div>

        <div className="space-y-4">
          <Bloco titulo="Contexto operacional">
            <p className="mb-2 text-[11px] text-zinc-500">
              O que está acontecendo agora. Entra em toda conversa do agente —
              promoção do dia, mudança de preço, campanha no ar.
            </p>
            <textarea
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              rows={7}
              placeholder="Ex: Campanha de captação no ar até sexta, verba de R$ 80/dia."
              className={INPUT}
            />
          </Bloco>

          <Bloco titulo="Ficha técnica">
            <Campo rotulo="Modelo">
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className={INPUT}
              >
                {CURATED_MODELS.some((m) => m.id === modelId) ? null : (
                  <option value={modelId}>{modelId} (atual)</option>
                )}
                {CURATED_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.badge}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={`Temperatura: ${temperatura}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={temperatura}
                  onChange={(e) => setTemperatura(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </Campo>
              <Campo rotulo="Máx. de tokens">
                <input
                  type="number"
                  min={256}
                  max={32000}
                  step={256}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className={INPUT}
                />
              </Campo>
            </div>
          </Bloco>
        </div>
      </div>

      <Bloco
        titulo={
          agent.isManaged ? 'Instruções adicionais' : 'Texto de instrução'
        }
      >
        {agent.isManaged ? (
          <>
            <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
              Este é um agente do produto: o texto de instrução dele é mantido
              pela Axory e recebe melhorias automaticamente. O que você escrever
              aqui é <strong>somado</strong> a esse texto — ajusta o
              comportamento sem substituir a base.
            </p>
            <textarea
              value={extras}
              onChange={(e) => setExtras(e.target.value)}
              rows={5}
              placeholder="Ex: sempre mencionar que atendemos apenas empresas do Simples Nacional. Nunca oferecer reunião antes de sexta."
              className={INPUT}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                Ver o texto de instrução original (somente leitura)
              </summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
                {agent.systemPrompt}
              </pre>
            </details>
          </>
        ) : (
          <>
            <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
              Este agente é seu: o texto abaixo define quem ele é e como age.
              Edite à vontade.
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={12}
              className={`${INPUT} font-mono text-xs`}
            />
            <p className="mt-2 text-[11px] text-zinc-500">
              Instruções adicionais (opcional) — úteis pra separar o ajuste do
              mês da definição permanente do agente:
            </p>
            <textarea
              value={extras}
              onChange={(e) => setExtras(e.target.value)}
              rows={3}
              className={INPUT}
            />
          </>
        )}
      </Bloco>
    </div>
  );
}

const INPUT =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:focus:border-[#8ab4ff]';

function Bloco({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-white/10">
      <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {titulo}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        {rotulo}
      </span>
      {children}
    </label>
  );
}
