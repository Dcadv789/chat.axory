'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2, Save, MessagesSquare, Plus, Trash2, Link2, RefreshCw, ArrowRight, Building2, Sparkles, Wallet, Database, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  marketingService,
  type MarketingBudgetMonth,
  type UpsertMarketingProfileInput,
} from '@/features/marketing/services/marketing.service';

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100';

// centavos <-> reais para a UI
const toReais = (c: number | null | undefined) => (c == null ? '' : (c / 100).toString());
/** Aceita "3000", "3000,50", "3.000,50" e "3000.50". */
const toCents = (v: string) => {
  const raw = String(v).replace(/[R$\s]/gi, '').trim();
  if (!raw) return undefined;
  let normalized = raw;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  // sem vírgula: "3.000" é separador de milhar, "3000.50" é decimal
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, '');
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};
/** Centavos → "3.000,50" (formato do input da tabela de verbas). */
const centsToBRL = (c: number) =>
  (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function MarketingRulesPage() {
  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['marketing-profile'],
    queryFn: () => marketingService.getProfile(),
  });

  const [form, setForm] = useState({
    companyDescription: '',
    products: '',
    targetAudience: '',
    toneOfVoice: '',
    guidelines: '',
    maxDailyBudget: '',
    externalRulesSkill: '',
    analysisWindow: 'LAST_MONTH',
  });
  const [saving, setSaving] = useState(false);
  const [openingCrew, setOpeningCrew] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const handleResync = async () => {
    setResyncing(true);
    try {
      await marketingService.resyncCrew();
      toast.success('Skills da crew re-sincronizadas');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao re-sincronizar');
    } finally {
      setResyncing(false);
    }
  };

  const [resetting, setResetting] = useState(false);
  const handleResetTestData = async () => {
    if (
      !confirm(
        'Resetar os dados de teste da crew?\n\nApaga: análises registradas, log de atividades e as conversas das crons (recriadas limpas no próximo disparo).\nPreserva: métricas de posts/anúncios, perfil, agentes, skills e a conversa do console da crew.',
      )
    )
      return;
    setResetting(true);
    try {
      const r = await marketingService.resetTestData();
      toast.success(
        `Reset feito: ${r.analyses} análise(s), ${r.activities} atividade(s) e ${r.conversations} conversa(s) de cron limpas.`,
      );
      queryClient.invalidateQueries({ queryKey: ['marketing-activity'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao resetar');
    } finally {
      setResetting(false);
    }
  };
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: crewChannels, refetch: refetchCrewChannels } = useQuery({
    queryKey: ['marketing-crew-channels'],
    queryFn: () => marketingService.listCrewChannels(),
  });

  const [attaching, setAttaching] = useState('');

  const handleAttachChannel = async (channelId: string) => {
    if (!channelId) return;
    // Pergunta se quer travar no primeiro remetente (só o dono fala com a crew).
    const lockSender = window.confirm(
      'Restringir para só você falar com a crew nesse canal?\n\n' +
        'OK = a PRIMEIRA pessoa que mandar mensagem vira o único remetente autorizado (mande você mesmo primeiro).\n' +
        'Cancelar = qualquer pessoa que mandar mensagem no canal fala com a crew.',
    );
    setAttaching(channelId);
    try {
      await marketingService.attachCrewChannel(channelId, lockSender);
      toast.success(
        lockSender
          ? 'Canal vinculado — mande a 1ª mensagem pra travar no seu remetente.'
          : 'Canal vinculado à crew',
      );
      refetchCrewChannels();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao vincular canal');
    } finally {
      setAttaching('');
    }
  };

  const handleDetachChannel = async (channelId: string) => {
    setAttaching(channelId);
    try {
      await marketingService.detachCrewChannel(channelId);
      toast.success('Canal desvinculado');
      refetchCrewChannels();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao desvincular canal');
    } finally {
      setAttaching('');
    }
  };

  const handleOpenCrew = async () => {
    setOpeningCrew(true);
    try {
      const res = await marketingService.ensureCrewChannel();
      // Faz o atalho "Marketing (crew)" aparecer na lateral na hora.
      queryClient.invalidateQueries({ queryKey: ['inbox-views'] });
      if (res?.viewId) router.push(`/inbox?view=${res.viewId}`);
      else if (res?.conversationId) router.push(`/inbox?conversationId=${res.conversationId}`);
      else toast.error('Não foi possível abrir o canal da crew.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao abrir o canal da crew');
    } finally {
      setOpeningCrew(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setForm({
        companyDescription: profile.companyDescription ?? '',
        products: profile.products ?? '',
        targetAudience: profile.targetAudience ?? '',
        toneOfVoice: profile.toneOfVoice ?? '',
        guidelines: profile.guidelines ?? '',
        maxDailyBudget: toReais(profile.maxDailyBudgetCents),
        externalRulesSkill: profile.externalRulesSkill ?? '',
        analysisWindow: profile.analysisWindow ?? 'LAST_MONTH',
      });
    }
  }, [profile]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: UpsertMarketingProfileInput = {
        companyDescription: form.companyDescription.trim() || undefined,
        products: form.products.trim() || undefined,
        targetAudience: form.targetAudience.trim() || undefined,
        toneOfVoice: form.toneOfVoice.trim() || undefined,
        guidelines: form.guidelines.trim() || undefined,
        maxDailyBudgetCents: toCents(form.maxDailyBudget),
        externalRulesSkill: form.externalRulesSkill.trim() || undefined,
        analysisWindow: form.analysisWindow || undefined,
      };
      await marketingService.upsertProfile(payload);
      toast.success('Regras salvas!');
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
          <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card icon={MessagesSquare} title="Crew de marketing">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Converse com o Magnus e a crew no app; para métricas e atividade, abra o Painel.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenCrew}
              disabled={openingCrew}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {openingCrew ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessagesSquare className="h-4 w-4" />}
              Abrir conversa
            </button>
            <Link
              href="/marketing"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Painel
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Canais da crew — além do console interno, dá pra atender a crew por um
            canal externo (ex.: Telegram) pra usar do celular. */}
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-zinc-500" />
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Canais da crew
            </p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Canais atendidos pela crew (Magnus). Vincule um canal externo — ex.:
            Telegram — para conversar com a crew pelo celular. Atenção: o canal
            escolhido passa a ser atendido pela crew, então use um canal dedicado.
          </p>

          <div className="mt-3 space-y-2">
            {(crewChannels?.channels ?? []).map((ch) => (
              <div
                key={ch.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">{ch.name}</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10">
                    {ch.type}
                  </span>
                  {ch.isPrimary && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      console interno
                    </span>
                  )}
                </div>
                {!ch.isPrimary && (
                  <button
                    onClick={() => handleDetachChannel(ch.id)}
                    disabled={attaching === ch.id}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10"
                  >
                    {attaching === ch.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Desvincular
                  </button>
                )}
              </div>
            ))}
          </div>

          {(crewChannels?.available?.length ?? 0) > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <select
                className={inputCls + ' max-w-xs'}
                defaultValue=""
                onChange={(e) => {
                  handleAttachChannel(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Vincular um canal externo…
                </option>
                {crewChannels!.available.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} ({ch.type})
                  </option>
                ))}
              </select>
              <Plus className="h-4 w-4 text-zinc-400" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Atualizou alguma skill da crew? Re-sincronize pra aplicar as
            correções mais recentes nesta organização.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleResetTestData}
              disabled={resetting}
              title="Apaga análises/atividades e limpa as conversas de cron — teste do zero. Métricas ficam."
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Resetar dados de teste
            </button>
            <button
              onClick={handleResync}
              disabled={resyncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {resyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-sincronizar skills
            </button>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card icon={Building2} title="Empresa e ofertas">
            <Field n={1} label="O que a empresa faz">
              <textarea rows={3} value={form.companyDescription} onChange={set('companyDescription')} className={inputCls}
                placeholder="Ex: Escola de finanças e tecnologia para empreendedores…" />
            </Field>

            <Field n={2} label="Produtos / serviços oferecidos">
              <textarea rows={4} value={form.products} onChange={set('products')} className={inputCls}
                placeholder="Liste os produtos, com preço/posicionamento quando fizer sentido." />
            </Field>

            <Field n={3} label="Público-alvo padrão">
              <textarea rows={3} value={form.targetAudience} onChange={set('targetAudience')} className={inputCls}
                placeholder="Ex: empreendedores 25-45, Brasil, interesse em finanças e produtividade…" />
            </Field>
          </Card>

          <Card icon={Sparkles} title="Voz e diretrizes">
            <Field n={4} label="Tom de voz da marca">
              <input type="text" value={form.toneOfVoice} onChange={set('toneOfVoice')} className={inputCls}
                placeholder="Ex: direto, próximo, sem jargão, otimista." />
            </Field>

            <Field n={5} label="Diretrizes / limites (o que pode e o que não pode)">
              <textarea rows={3} value={form.guidelines} onChange={set('guidelines')} className={inputCls}
                placeholder="Ex: nunca prometer ROI; não citar concorrentes; sempre incluir CTA…" />
            </Field>
          </Card>
        </div>

        <div className="space-y-4">
          <Card icon={Wallet} title="Verba e mídia">
            <MonthlyBudgets />

            <Field n={7} label="Teto diário por campanha (R$)">
              <input type="text" inputMode="decimal" value={form.maxDailyBudget} onChange={set('maxDailyBudget')}
                className={inputCls} placeholder="Ex: 100" />
            </Field>

            <Field
              n={8}
              label="Janela de análise"
              hint="Período que a crew considera ao analisar posts e métricas. Ela respeita a opção marcada."
            >
              <select value={form.analysisWindow} onChange={set('analysisWindow')} className={inputCls}>
                <option value="LAST_MONTH">Último mês (30 dias)</option>
                <option value="LAST_3_MONTHS">Últimos 3 meses</option>
                <option value="LAST_6_MONTHS">Últimos 6 meses</option>
                <option value="LAST_YEAR">Último ano (12 meses)</option>
              </select>
            </Field>
          </Card>

          <Card icon={Database} title="Regras externas (opcional)">
            <Field
              n={9}
              label="Skill SQL de regras externas (opcional)"
              hint="Para empresas com banco de dados próprio: nome de uma skill SQL que busca as regras lá. Deixe vazio para usar só o que está nesta página."
            >
              <input type="text" value={form.externalRulesSkill} onChange={set('externalRulesSkill')} className={inputCls}
                placeholder="Ex: buscarRegrasMarketing" />
            </Field>
          </Card>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar regras
        </button>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="flex items-center gap-2.5 border-b border-zinc-200 px-5 py-3.5 dark:border-white/10">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      </div>
      <div className="p-5 [&>*+*]:mt-4 [&>*+*]:border-t [&>*+*]:border-zinc-100 [&>*+*]:pt-4 dark:[&>*+*]:border-white/10">{children}</div>
    </section>
  );
}

function Field({ label, hint, children, n, action }: { label: string; hint?: string; children: React.ReactNode; n?: number; action?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        {n != null && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {n}
          </span>
        )}
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {hint && <p className="mb-1.5 text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * Verba de mídia mês a mês, com seletor de ano.
 *
 * Um mês sem valor próprio herda o do mês definido mais recente antes dele —
 * assim não é preciso redigitar todo mês, e definir a verba de hoje não muda
 * o pacing dos meses passados. Salva ao sair do campo (ou no Enter).
 */
function MonthlyBudgets() {
  const queryClient = useQueryClient();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  // texto digitado por mês + quais linhas o usuário mexeu (evita salvar só por passar pelo campo)
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState<Record<number, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['marketing-budgets', year],
    queryFn: () => marketingService.listBudgets(year),
  });

  useEffect(() => {
    if (!data) return;
    setDrafts(
      Object.fromEntries(data.months.map((m) => [m.month, m.amountCents == null ? '' : centsToBRL(m.amountCents)])),
    );
    setDirty({});
  }, [data]);

  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: ['marketing-budgets'] });
    queryClient.invalidateQueries({ queryKey: ['marketing-overview'] });
  };
  const onError = (err: any) =>
    toast.error(err?.response?.data?.message ?? 'Erro ao salvar a verba do mês');

  const saveMutation = useMutation({
    mutationFn: (v: { month: number; amountCents: number }) =>
      marketingService.setBudget(year, v.month, v.amountCents),
    onSuccess: (_res, v) => {
      onSettled();
      toast.success(`Verba de ${MONTHS_SHORT[v.month - 1]}/${year} definida`);
    },
    onError,
  });

  const clearMutation = useMutation({
    mutationFn: (v: { month: number }) => marketingService.clearBudget(year, v.month),
    onSuccess: (_res, v) => {
      onSettled();
      toast.success(`${MONTHS_SHORT[v.month - 1]}/${year} voltou a herdar o valor anterior`);
    },
    onError,
  });

  const busyMonth =
    (saveMutation.isPending && saveMutation.variables?.month) ||
    (clearMutation.isPending && clearMutation.variables?.month) ||
    null;

  const commit = (m: MarketingBudgetMonth) => {
    if (!dirty[m.month]) return;
    const raw = (drafts[m.month] ?? '').trim();
    if (!raw) {
      setDirty((d) => ({ ...d, [m.month]: false }));
      // limpar o campo de um mês definido = voltar a herdar
      if (m.origin === 'explicit') clearMutation.mutate({ month: m.month });
      else setDrafts((s) => ({ ...s, [m.month]: m.amountCents == null ? '' : centsToBRL(m.amountCents) }));
      return;
    }
    const cents = toCents(raw);
    if (cents == null) {
      toast.error('Valor inválido — use algo como 3000 ou 3.000,50');
      return;
    }
    setDirty((d) => ({ ...d, [m.month]: false }));
    if (m.origin === 'explicit' && cents === m.amountCents) return; // nada mudou
    saveMutation.mutate({ month: m.month, amountCents: cents });
  };

  const symbol = data?.currency && data.currency !== 'BRL' ? data.currency : 'R$';

  const yearNav = (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => setYear((y) => y - 1)}
        aria-label="Ano anterior"
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-zinc-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="w-12 text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {year}
      </span>
      <button
        type="button"
        onClick={() => setYear((y) => y + 1)}
        aria-label="Próximo ano"
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-zinc-100"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <Field
      n={6}
      label="Verba mensal de mídia"
      hint="Meses sem valor próprio herdam o último valor definido. Definir a verba de um mês não altera os meses anteriores. Salva ao sair do campo."
      action={yearNav}
    >
      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {(data?.months ?? []).map((m) => {
            const isCurrent = year === currentYear && m.month === currentMonth;
            const isExplicit = m.origin === 'explicit';
            const busy = busyMonth === m.month;
            return (
              <div
                key={m.month}
                className={
                  'flex items-center gap-2 rounded-lg border px-2 py-1.5 ' +
                  (isCurrent
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-transparent hover:bg-zinc-50 dark:hover:bg-white/5')
                }
              >
                <span
                  className={
                    'w-20 shrink-0 text-sm ' +
                    (isCurrent
                      ? 'font-semibold text-primary'
                      : 'text-zinc-600 dark:text-zinc-400')
                  }
                >
                  {MONTHS[m.month - 1]}
                </span>

                <span className="shrink-0 text-xs text-zinc-400">{symbol}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={drafts[m.month] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDrafts((s) => ({ ...s, [m.month]: v }));
                    setDirty((d) => ({ ...d, [m.month]: true }));
                  }}
                  onBlur={() => commit(m)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') {
                      setDrafts((s) => ({ ...s, [m.month]: m.amountCents == null ? '' : centsToBRL(m.amountCents) }));
                      setDirty((d) => ({ ...d, [m.month]: false }));
                    }
                  }}
                  disabled={busy}
                  placeholder="—"
                  className={
                    inputCls +
                    ' flex-1 tabular-nums disabled:opacity-50 ' +
                    (isExplicit ? '' : 'text-zinc-400 dark:text-zinc-500')
                  }
                />

                <div className="flex w-28 shrink-0 items-center justify-end">
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  ) : isExplicit ? (
                    <button
                      type="button"
                      onClick={() => clearMutation.mutate({ month: m.month })}
                      title="Remover o valor próprio deste mês — ele volta a herdar o último valor definido"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                    >
                      <RotateCcw className="h-3 w-3" />
                      herdar
                    </button>
                  ) : m.origin === 'inherited' && m.inheritedFrom ? (
                    <span className="truncate text-[11px] text-zinc-400">
                      herdado de {MONTHS_SHORT[m.inheritedFrom.month - 1]}/{m.inheritedFrom.year}
                    </span>
                  ) : m.origin === 'legacy' ? (
                    <span className="truncate text-[11px] text-zinc-400">verba antiga</span>
                  ) : (
                    <span className="text-[11px] text-zinc-300 dark:text-zinc-600">sem verba</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Field>
  );
}
