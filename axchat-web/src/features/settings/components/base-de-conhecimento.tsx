'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  knowledgeService,
  type KnowledgeDocument,
  type UpsertKnowledgeDocumentInput,
} from '../services/knowledge.service';
import { agentSectorsService } from '@/features/ai-agents/services/agent-sectors.service';

/**
 * O que a IA sabe da empresa.
 *
 * Três níveis: os campos aqui valem pra todos os agentes; cada departamento
 * pode ter conhecimento próprio; e documentos guardam o que nenhum formulário
 * prevê.
 *
 * Os campos são separados de propósito. Num texto único o modelo trata
 * "mantenha tom consultivo" e "nunca prometa retorno" com o mesmo peso — e o
 * segundo é limite duro.
 */
export function BaseDeConhecimento() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    whatWeDo: '',
    products: '',
    targetAudience: '',
    differentials: '',
    serviceHours: '',
    toneOfVoice: '',
    guidelines: '',
    restrictions: '',
    faq: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['company-knowledge'],
    queryFn: knowledgeService.getCompany,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      whatWeDo: data.whatWeDo ?? '',
      products: data.products ?? '',
      targetAudience: data.targetAudience ?? '',
      differentials: data.differentials ?? '',
      serviceHours: data.serviceHours ?? '',
      toneOfVoice: data.toneOfVoice ?? '',
      guidelines: data.guidelines ?? '',
      restrictions: data.restrictions ?? '',
      faq: data.faq ?? '',
    });
  }, [data]);

  const set =
    (campo: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [campo]: e.target.value }));

  const salvar = useMutation({
    mutationFn: () => knowledgeService.upsertCompany(form),
    onSuccess: () => {
      toast.success('Conhecimento salvo');
      qc.invalidateQueries({ queryKey: ['company-knowledge'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Erro ao salvar'),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-[#8ab4ff]" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                O que a IA sabe da sua empresa
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                Entra na conversa de todos os agentes. Quanto mais concreto,
                menos eles improvisam — e improviso em preço, prazo ou política
                é o que gera problema com cliente.
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <Campo
                rotulo="O que a empresa faz"
                ajuda="Em duas ou três frases, como você explicaria para alguém que nunca ouviu falar."
              >
                <textarea rows={3} value={form.whatWeDo} onChange={set('whatWeDo')} className={INPUT} />
              </Campo>
              <Campo
                rotulo="Produtos e serviços"
                ajuda="Com preço e posicionamento quando fizer sentido. É daqui que sai a resposta sobre quanto custa."
              >
                <textarea rows={3} value={form.products} onChange={set('products')} className={INPUT} />
              </Campo>
              <Campo
                rotulo="Para quem é — e para quem não é"
                ajuda="Dizer quem você NÃO atende evita o agente aceitar um cliente que sua operação não consegue servir."
              >
                <textarea rows={3} value={form.targetAudience} onChange={set('targetAudience')} className={INPUT} />
              </Campo>
              <Campo
                rotulo="Diferenciais"
                ajuda="Por que escolher você. É o que o agente usa para sustentar valor sem inventar vantagem."
              >
                <textarea rows={3} value={form.differentials} onChange={set('differentials')} className={INPUT} />
              </Campo>
              <Campo
                rotulo="Horários e prazos"
                ajuda="Quando vocês atendem e em quanto tempo respondem ou entregam."
              >
                <textarea rows={2} value={form.serviceHours} onChange={set('serviceHours')} className={INPUT} />
              </Campo>
              <Campo rotulo="Tom de voz" ajuda="Como a marca fala.">
                <textarea rows={2} value={form.toneOfVoice} onChange={set('toneOfVoice')} className={INPUT} />
              </Campo>
            </div>

            <Campo
              rotulo="Diretrizes — como agir"
              ajuda="Orientação de comportamento. Ex: sempre confirmar o nome antes de propor reunião."
            >
              <textarea rows={3} value={form.guidelines} onChange={set('guidelines')} className={INPUT} />
            </Campo>

            <Campo
              rotulo="Restrições — o que NUNCA fazer"
              ajuda="Proibições absolutas. Diferente das diretrizes: a IA é instruída a recusar a tarefa se só conseguir cumpri-la violando uma destas."
            >
              <textarea rows={3} value={form.restrictions} onChange={set('restrictions')} className={INPUT} />
            </Campo>

            <Campo
              rotulo="Dúvidas frequentes, com a resposta oficial"
              ajuda="O que mais perguntam, e como você quer que seja respondido. É o que evita o agente improvisar justamente no que mais aparece."
            >
              <textarea rows={6} value={form.faq} onChange={set('faq')} className={INPUT} />
            </Campo>

            <div className="flex justify-end">
              <button
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {salvar.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </button>
            </div>
          </div>
        )}
      </section>

      <ConhecimentoPorDepartamento />
      <Documentos />
    </div>
  );
}

/* ─────────────────── Departamento ─────────────────── */

function ConhecimentoPorDepartamento() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const [texto, setTexto] = useState('');

  const { data: departamentos = [] } = useQuery({
    queryKey: ['agent-sectors'],
    queryFn: () => agentSectorsService.list(),
  });

  const salvar = useMutation({
    mutationFn: ({ id, knowledge }: { id: string; knowledge: string }) =>
      knowledgeService.setSectorKnowledge(id, knowledge),
    onSuccess: () => {
      toast.success('Conhecimento do departamento salvo');
      setAberto(null);
      qc.invalidateQueries({ queryKey: ['agent-sectors'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Erro ao salvar'),
  });

  if (departamentos.length === 0) return null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-white/10">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Conhecimento por departamento
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
          O que vale só para um time — tabela de honorários do contábil, prazos
          do jurídico. Entra apenas na conversa dos agentes daquele
          departamento; no prompt dos outros seria ruído.
        </p>
      </div>

      <ul className="divide-y divide-zinc-100 dark:divide-white/5">
        {departamentos.map((d: any) => (
          <li key={d.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color ?? '#a1a1aa' }}
                />
                <span className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                  {d.name}
                </span>
                {d.knowledge ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">
                    preenchido
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400">vazio</span>
                )}
              </div>
              <button
                onClick={() => {
                  setAberto(aberto === d.id ? null : d.id);
                  setTexto(d.knowledge ?? '');
                }}
                className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                {aberto === d.id ? 'Fechar' : 'Editar'}
              </button>
            </div>

            {aberto === d.id && (
              <div className="mt-3">
                <textarea
                  rows={5}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex: honorários a partir de R$ 500/mês para Simples Nacional até 20 notas."
                  className={INPUT}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => salvar.mutate({ id: d.id, knowledge: texto })}
                    disabled={salvar.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {salvar.isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────── Documentos ─────────────────── */

function Documentos() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<KnowledgeDocument | null>(null);
  const [criando, setCriando] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['knowledge-documents'],
    queryFn: knowledgeService.listDocuments,
  });

  const remover = useMutation({
    mutationFn: (id: string) => knowledgeService.removeDocument(id),
    onSuccess: () => {
      toast.success('Documento removido');
      qc.invalidateQueries({ queryKey: ['knowledge-documents'] });
    },
  });

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-white/10">
        <div className="flex min-w-0 items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-[#8ab4ff]" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Documentos
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Para o que não cabe nos campos acima: política de reembolso,
              tabela de preços, contrato modelo. O agente não recebe o texto
              inteiro — ele vê a lista e busca o documento quando o assunto
              aparece.
            </p>
          </div>
        </div>
        <button
          onClick={() => setCriando(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Novo
        </button>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : docs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-5 text-center text-xs text-zinc-500 dark:border-white/10">
            Nenhum documento. Use quando a informação for longa demais para os
            campos acima.
          </p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-white/10"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {d.title}
                    </p>
                    {d.sector && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        {d.sector.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                    {d.summary || 'Sem resumo — o agente decide buscar pelo título.'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditando(d)}
                    className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remover.mutate(d.id)}
                    className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:hover:bg-rose-500/10"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(criando || editando) && (
        <FormularioDocumento
          documento={editando}
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSalvo={() => {
            setCriando(false);
            setEditando(null);
            qc.invalidateQueries({ queryKey: ['knowledge-documents'] });
          }}
        />
      )}
    </section>
  );
}

function FormularioDocumento({
  documento,
  onFechar,
  onSalvo,
}: {
  documento: KnowledgeDocument | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState({
    title: documento?.title ?? '',
    summary: documento?.summary ?? '',
    content: documento?.content ?? '',
    sectorId: documento?.sectorId ?? '',
  });

  const { data: departamentos = [] } = useQuery({
    queryKey: ['agent-sectors'],
    queryFn: () => agentSectorsService.list(),
  });

  const salvar = useMutation({
    mutationFn: (input: UpsertKnowledgeDocumentInput) =>
      documento
        ? knowledgeService.updateDocument(documento.id, input)
        : knowledgeService.createDocument(input),
    onSuccess: () => {
      toast.success(documento ? 'Documento atualizado' : 'Documento criado');
      onSalvo();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Erro ao salvar'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onFechar} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {documento ? 'Editar documento' : 'Novo documento'}
          </h3>
          <button
            onClick={onFechar}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto scrollbar-thin px-5 py-4">
          <Campo rotulo="Título">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Política de reembolso"
              className={INPUT}
            />
          </Campo>

          <Campo
            rotulo="Quando consultar"
            ajuda="Uma linha. É o que o agente lê para decidir abrir o documento — vale mais que o título."
          >
            <input
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="Prazos e condições para devolver o dinheiro ao cliente."
              className={INPUT}
            />
          </Campo>

          <Campo
            rotulo="Departamento"
            ajuda="Vazio = todos os agentes enxergam. Preenchido = só os daquele departamento."
          >
            <select
              value={form.sectorId}
              onChange={(e) => setForm((f) => ({ ...f, sectorId: e.target.value }))}
              className={INPUT}
            >
              <option value="">— Toda a empresa —</option>
              {departamentos.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Conteúdo">
            <textarea
              rows={14}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className={INPUT}
            />
          </Campo>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-white/10">
          <button
            onClick={onFechar}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!form.title.trim() || form.content.trim().length < 10) {
                toast.error('Título e conteúdo são obrigatórios.');
                return;
              }
              salvar.mutate({
                title: form.title.trim(),
                summary: form.summary.trim() || undefined,
                content: form.content.trim(),
                sectorId: form.sectorId || null,
              });
            }}
            disabled={salvar.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:focus:border-[#8ab4ff]';

function Campo({
  rotulo,
  ajuda,
  children,
}: {
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {rotulo}
      </span>
      {children}
      {ajuda && (
        <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">
          {ajuda}
        </span>
      )}
    </label>
  );
}
