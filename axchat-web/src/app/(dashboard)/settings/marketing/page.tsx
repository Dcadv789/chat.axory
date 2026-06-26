'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, Loader2, Save } from 'lucide-react';
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
  });
  const [saving, setSaving] = useState(false);

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
      });
    }
  }, [profile]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
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
        label="Skill SQL de regras externas (opcional)"
        hint="Para empresas com banco de dados próprio: nome de uma skill SQL que busca as regras lá. Deixe vazio para usar só o que está nesta página."
      >
        <input type="text" value={form.externalRulesSkill} onChange={set('externalRulesSkill')} className={inputCls}
          placeholder="Ex: buscarRegrasMarketing" />
      </Field>

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  );
}
