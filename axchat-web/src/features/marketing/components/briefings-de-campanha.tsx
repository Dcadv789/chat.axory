'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Target,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  marketingService,
  type CampaignBrief,
  type UpsertCampaignBriefInput,
} from '../services/marketing.service';

/**
 * Briefings de campanha.
 *
 * O perfil de marketing diz quem é a empresa e vale pra tudo. Aqui cada
 * campanha diz o que ELA quer — e é o que permite duas no ar querendo coisas
 * opostas: uma captando lead frio, outra reativando cliente antigo. Com um
 * perfil só, a equipe de IA tratava as duas com a mesma mensagem.
 */
export function BriefingsDeCampanha() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<CampaignBrief | null>(null);
  const [criando, setCriando] = useState(false);

  const { data: briefings = [], isLoading } = useQuery({
    queryKey: ['campaign-briefs'],
    queryFn: () => marketingService.listCampaignBriefs(),
  });

  const recarregar = () =>
    qc.invalidateQueries({ queryKey: ['campaign-briefs'] });

  const status = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
    }) => marketingService.setCampaignBriefStatus(id, status),
    onSuccess: () => {
      toast.success('Campanha atualizada');
      recarregar();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Erro ao atualizar'),
  });

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-white/10">
        <div className="flex min-w-0 items-start gap-3">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-[#8ab4ff]" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Campanhas
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Cada campanha com o próprio objetivo, público e limites. A equipe
              de IA consulta antes de criar conteúdo ou anúncio — e o briefing
              tem precedência sobre o perfil geral acima.
            </p>
          </div>
        </div>
        <button
          onClick={() => setCriando(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Nova campanha
        </button>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : briefings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center dark:border-white/10">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Nenhuma campanha cadastrada.
            </p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-zinc-500">
              Sem briefing, a equipe de IA usa só o perfil da empresa e escolhe
              a direção sozinha — pelo que performou no passado. Cadastre uma
              campanha quando quiser mandar num rumo específico.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {briefings.map((b) => (
              <li
                key={b.id}
                className={`rounded-lg border px-4 py-3 ${
                  b.status === 'ACTIVE'
                    ? 'border-zinc-200 dark:border-white/10'
                    : 'border-dashed border-zinc-200 bg-zinc-50/50 dark:border-white/10 dark:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {b.name}
                      </p>
                      <Etiqueta status={b.status} />
                      {b.adIds.length > 0 && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                          {b.adIds.length}{' '}
                          {b.adIds.length === 1 ? 'anúncio' : 'anúncios'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {b.objective}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconeBotao
                      titulo={b.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
                      onClick={() =>
                        status.mutate({
                          id: b.id,
                          status: b.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                        })
                      }
                    >
                      {b.status === 'ACTIVE' ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </IconeBotao>
                    <IconeBotao titulo="Editar" onClick={() => setEditando(b)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconeBotao>
                    <IconeBotao
                      titulo="Arquivar (não apaga — vira histórico)"
                      onClick={() =>
                        status.mutate({ id: b.id, status: 'ARCHIVED' })
                      }
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </IconeBotao>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(criando || editando) && (
        <FormularioBriefing
          briefing={editando}
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSalvo={() => {
            setCriando(false);
            setEditando(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function FormularioBriefing({
  briefing,
  onFechar,
  onSalvo,
}: {
  briefing: CampaignBrief | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState({
    name: briefing?.name ?? '',
    objective: briefing?.objective ?? '',
    targetAudience: briefing?.targetAudience ?? '',
    offer: briefing?.offer ?? '',
    keyMessage: briefing?.keyMessage ?? '',
    restrictions: briefing?.restrictions ?? '',
    adIds: (briefing?.adIds ?? []).join(', '),
    verba:
      briefing?.monthlyBudgetCents != null
        ? String(briefing.monthlyBudgetCents / 100)
        : '',
  });

  const set =
    (campo: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [campo]: e.target.value }));

  const salvar = useMutation({
    mutationFn: (input: UpsertCampaignBriefInput) =>
      briefing
        ? marketingService.updateCampaignBrief(briefing.id, input)
        : marketingService.createCampaignBrief(input),
    onSuccess: () => {
      toast.success(briefing ? 'Campanha atualizada' : 'Campanha criada');
      onSalvo();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Erro ao salvar'),
  });

  const enviar = () => {
    if (!form.name.trim() || !form.objective.trim()) {
      toast.error('Nome e objetivo são obrigatórios.');
      return;
    }
    const verba = Number(form.verba.replace(',', '.'));
    salvar.mutate({
      name: form.name.trim(),
      objective: form.objective.trim(),
      targetAudience: form.targetAudience.trim() || undefined,
      offer: form.offer.trim() || undefined,
      keyMessage: form.keyMessage.trim() || undefined,
      restrictions: form.restrictions.trim() || undefined,
      // Aceita colado com vírgula, ponto-e-vírgula ou quebra de linha: o id
      // costuma vir copiado do painel da Meta, em lote.
      adIds: form.adIds
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      monthlyBudgetCents:
        form.verba.trim() && !Number.isNaN(verba)
          ? Math.round(verba * 100)
          : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onFechar} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {briefing ? 'Editar campanha' : 'Nova campanha'}
          </h3>
          <button
            onClick={onFechar}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto scrollbar-thin px-5 py-4">
          <Campo rotulo="Nome da campanha" obrigatorio>
            <input
              value={form.name}
              onChange={set('name')}
              placeholder="Ex: Captação BPO contábil — Q3"
              className={INPUT}
            />
          </Campo>

          <Campo
            rotulo="Objetivo"
            obrigatorio
            ajuda="O que esta campanha precisa conseguir. Seja concreto — é o que a IA usa para decidir ângulo e formato."
          >
            <textarea
              rows={3}
              value={form.objective}
              onChange={set('objective')}
              placeholder="Ex: gerar 15 reuniões por mês com sócios de escritórios contábeis de 5 a 30 funcionários."
              className={INPUT}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Público desta campanha"
              ajuda="Vazio = usa o público padrão do perfil."
            >
              <textarea
                rows={3}
                value={form.targetAudience}
                onChange={set('targetAudience')}
                className={INPUT}
              />
            </Campo>
            <Campo rotulo="Oferta / produto" ajuda="O que ela está vendendo.">
              <textarea
                rows={3}
                value={form.offer}
                onChange={set('offer')}
                className={INPUT}
              />
            </Campo>
          </div>

          <Campo
            rotulo="Mensagem central"
            ajuda="O ângulo que amarra os criativos desta campanha."
          >
            <textarea
              rows={2}
              value={form.keyMessage}
              onChange={set('keyMessage')}
              className={INPUT}
            />
          </Campo>

          <Campo
            rotulo="O que NÃO fazer nesta campanha"
            ajuda="Soma-se às restrições gerais da empresa — não substitui."
          >
            <textarea
              rows={2}
              value={form.restrictions}
              onChange={set('restrictions')}
              className={INPUT}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="IDs dos anúncios no Meta"
              ajuda="Cole os IDs separados por vírgula. É o que liga esta campanha ao resultado medido: quantos clientes ela trouxe e a que custo."
            >
              <textarea
                rows={2}
                value={form.adIds}
                onChange={set('adIds')}
                placeholder="120210000000, 120210000001"
                className={INPUT}
              />
            </Campo>
            <Campo rotulo="Verba mensal (R$)" ajuda="Opcional.">
              <input
                value={form.verba}
                onChange={set('verba')}
                inputMode="decimal"
                placeholder="2000"
                className={INPUT}
              />
            </Campo>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-white/10">
          <button
            onClick={onFechar}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
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
  obrigatorio,
  children,
}: {
  rotulo: string;
  ajuda?: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-rose-500">*</span>}
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

function Etiqueta({ status }: { status: CampaignBrief['status'] }) {
  const mapa = {
    ACTIVE: {
      texto: 'No ar',
      cor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300',
    },
    PAUSED: {
      texto: 'Pausada',
      cor: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    },
    ARCHIVED: {
      texto: 'Arquivada',
      cor: 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400',
    },
  }[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${mapa.cor}`}>
      {mapa.texto}
    </span>
  );
}

function IconeBotao({
  titulo,
  onClick,
  children,
}: {
  titulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={titulo}
      onClick={onClick}
      className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
    >
      {children}
    </button>
  );
}
