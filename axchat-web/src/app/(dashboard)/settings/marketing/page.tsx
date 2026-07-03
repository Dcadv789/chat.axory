'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Megaphone, Loader2, Save, MessagesSquare, Plus, Trash2, Link2, RefreshCw, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  marketingService,
  type UpsertMarketingProfileInput,
} from '@/features/marketing/services/marketing.service';

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100';

// centavos <-> reais para a UI
const toReais = (c: number | null | undefined) => (c == null ? '' : (c / 100).toString());
const toCents = (v: string) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

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
    monthlyAdBudget: '',
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
        monthlyAdBudget: toReais(profile.monthlyAdBudgetCents),
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
        monthlyAdBudgetCents: toCents(form.monthlyAdBudget),
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
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          <Megaphone className="h-5 w-5 text-primary" />
          Regras de Marketing
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          As regras que os agentes de marketing seguem para definir público, criar
          campanhas e escrever copy de forma autônoma. Quem tem banco de dados
          externo pode apontar uma skill SQL no campo final; quem não tem, preenche aqui.
        </p>
      </div>

      <Link
        href="/marketing"
        className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-5 py-3 transition-colors hover:bg-primary/10"
      >
        <span className="text-sm text-zinc-700 dark:text-zinc-200">
          Gerir anúncios, ver métricas e a atividade da crew? Abra o{' '}
          <span className="font-semibold text-primary">Painel de Marketing</span>.
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
      </Link>

      <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessagesSquare className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Falar com a crew de marketing
            </p>
            <p className="text-xs text-zinc-500">
              Converse direto com o Magnus (orquestrador) e a crew dentro do app. O
              atalho fica fixo na lateral, em "Marketing (crew)".
            </p>
          </div>
        </div>
        <button
          onClick={handleOpenCrew}
          disabled={openingCrew}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {openingCrew ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessagesSquare className="h-4 w-4" />}
          Abrir conversa
        </button>
      </div>

      {/* Canais da crew — além do console interno, dá pra atender a crew por um
          canal externo (ex.: Telegram) pra usar do celular. */}
      <div className="rounded-xl border border-zinc-200 px-5 py-4 dark:border-white/10">
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
              className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-white/10"
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

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3 dark:border-white/10">
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
      </div>

      <div className="grid items-start gap-x-6 gap-y-5 lg:grid-cols-2">
        <Field label="O que a empresa faz">
          <textarea rows={3} value={form.companyDescription} onChange={set('companyDescription')} className={inputCls}
            placeholder="Ex: Escola de finanças e tecnologia para empreendedores…" />
        </Field>

        <Field label="Produtos / serviços oferecidos">
          <textarea rows={4} value={form.products} onChange={set('products')} className={inputCls}
            placeholder="Liste os produtos, com preço/posicionamento quando fizer sentido." />
        </Field>

        <Field label="Público-alvo padrão">
          <textarea rows={3} value={form.targetAudience} onChange={set('targetAudience')} className={inputCls}
            placeholder="Ex: empreendedores 25-45, Brasil, interesse em finanças e produtividade…" />
        </Field>

        <Field label="Tom de voz da marca">
          <input type="text" value={form.toneOfVoice} onChange={set('toneOfVoice')} className={inputCls}
            placeholder="Ex: direto, próximo, sem jargão, otimista." />
        </Field>

        <Field label="Diretrizes / limites (o que pode e o que não pode)">
          <textarea rows={3} value={form.guidelines} onChange={set('guidelines')} className={inputCls}
            placeholder="Ex: nunca prometer ROI; não citar concorrentes; sempre incluir CTA…" />
        </Field>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Verba mensal de mídia (R$)">
              <input type="text" inputMode="decimal" value={form.monthlyAdBudget} onChange={set('monthlyAdBudget')}
                className={inputCls} placeholder="Ex: 3000" />
            </Field>
            <Field label="Teto diário por campanha (R$)">
              <input type="text" inputMode="decimal" value={form.maxDailyBudget} onChange={set('maxDailyBudget')}
                className={inputCls} placeholder="Ex: 100" />
            </Field>
          </div>

          <Field
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

          <Field
            label="Skill SQL de regras externas (opcional)"
            hint="Para empresas com banco de dados próprio: nome de uma skill SQL que busca as regras lá. Deixe vazio para usar só o que está nesta página."
          >
            <input type="text" value={form.externalRulesSkill} onChange={set('externalRulesSkill')} className={inputCls}
              placeholder="Ex: buscarRegrasMarketing" />
          </Field>
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
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  );
}
