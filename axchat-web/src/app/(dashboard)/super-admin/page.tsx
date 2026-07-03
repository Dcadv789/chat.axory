'use client';

import { Fragment, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Bot,
  Ban,
  ChevronDown,
  CheckCircle2,
  CreditCard,
  Crown,
  History,
  LogIn,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  DEFAULT_PLAN_TEMPLATES,
  type BillingStatus,
  type SuperAdminAuditLog,
  type SuperAdminOrganization,
  type SuperAdminUser,
  type SuperAdminOverview,
} from '@/features/super-admin/services/super-admin.service';
import { EditUserDialog } from '@/features/super-admin/components/edit-user-dialog';
import { AgentsPanel } from '@/features/super-admin/components/agents-panel';
import { SkillsPanel } from '@/features/super-admin/components/skills-panel';
import { DepartmentsPanel } from '@/features/super-admin/components/departments-panel';
import { JarvisBuiltinToolsTab } from '@/features/ai-agents/components/jarvis/builtin-tools-tab';
import { useAuthStore } from '@/stores/auth-store';

const planOptions = ['inbox', 'essencial', 'profissional', 'performance'];
const billingStatusOptions: BillingStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXEMPT'];

export default function SuperAdminPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'organizations' | 'users' | 'agents' | 'skills' | 'departments' | 'plans' | 'audit' | 'tools' | 'integrations'>('organizations');
  const [search, setSearch] = useState('');

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['super-admin-overview'],
    queryFn: superAdminService.overview,
    enabled: !!user?.isSuperAdmin,
  });

  const { data: organizations = [], isLoading: loadingOrgs } = useQuery({
    queryKey: ['super-admin-organizations', search],
    queryFn: () => superAdminService.organizations(search),
    enabled: !!user?.isSuperAdmin,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['super-admin-users', search],
    queryFn: () => superAdminService.users(search),
    enabled: !!user?.isSuperAdmin,
  });

  const { data: auditLogs = [], isLoading: loadingAudit } = useQuery({
    queryKey: ['super-admin-audit-logs'],
    queryFn: () => superAdminService.auditLogs({ limit: 100 }),
    enabled: !!user?.isSuperAdmin,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['super-admin-overview'] });
    queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
    queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
    queryClient.invalidateQueries({ queryKey: ['super-admin-audit-logs'] });
    queryClient.invalidateQueries({ queryKey: ['super-admin-departments'] });
  };

  if (!user?.isSuperAdmin) {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-black">
          <Shield className="mx-auto h-8 w-8 text-zinc-400" />
          <h1 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Acesso restrito</h1>
          <p className="mt-1 text-sm text-zinc-500">Este painel e exclusivo para donos da plataforma.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Super Admin</h1>
              <p className="text-xs text-zinc-500">Controle global da plataforma, clientes, planos e acessos.</p>
            </div>
          </div>

          <div className="relative w-full min-w-[220px] sm:max-w-md lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar empresa, plano, nome ou email"
              className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="w-full min-w-0">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Kpi loading={overviewLoading} label="Empresas" value={overview?.organizations} icon={Building2} />
          <Kpi loading={overviewLoading} label="Usuarios" value={overview?.users} icon={Users} />
          <Kpi loading={overviewLoading} label="Suspensas" value={overview?.suspendedOrganizations} icon={Ban} />
          <Kpi loading={overviewLoading} label="Canais ativos" value={`${overview?.activeChannels ?? 0}/${overview?.channels ?? 0}`} icon={MessageCircle} />
          <Kpi loading={overviewLoading} label="Agentes IA" value={overview?.agents} icon={Bot} />
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex flex-wrap gap-2">
            <Tab active={tab === 'organizations'} onClick={() => setTab('organizations')}>Empresas</Tab>
            <Tab active={tab === 'users'} onClick={() => setTab('users')}>Usuarios</Tab>
            <Tab active={tab === 'agents'} onClick={() => setTab('agents')}>Agentes</Tab>
            <Tab active={tab === 'skills'} onClick={() => setTab('skills')}>Skills</Tab>
            <Tab active={tab === 'departments'} onClick={() => setTab('departments')}>Departamentos</Tab>
            <Tab active={tab === 'plans'} onClick={() => setTab('plans')}>Planos</Tab>
            <Tab active={tab === 'audit'} onClick={() => setTab('audit')}>Auditoria</Tab>
            <Tab active={tab === 'tools'} onClick={() => setTab('tools')}>Tools do sistema</Tab>
            <Tab active={tab === 'integrations'} onClick={() => setTab('integrations')}>Integrações</Tab>
          </div>
        </div>

        {tab === 'organizations' && (
          <OrganizationsPanel
            organizations={organizations}
            loading={loadingOrgs}
            onChanged={refresh}
          />
        )}
        {tab === 'users' && (
          <UsersPanel
            users={users}
            organizations={organizations}
            loading={loadingUsers}
            onChanged={refresh}
          />
        )}
        {tab === 'agents' && (
          <AgentsPanel
            organizations={organizations}
            loading={loadingOrgs}
            onChanged={refresh}
          />
        )}
        {tab === 'skills' && (
          <SkillsPanel
            organizations={organizations}
            loading={loadingOrgs}
            onChanged={refresh}
          />
        )}
        {tab === 'departments' && (
          <DepartmentsPanel onChanged={refresh} />
        )}
        {tab === 'plans' && <PlansPanel overview={overview} onChanged={refresh} />}
        {tab === 'audit' && <AuditPanel logs={auditLogs} loading={loadingAudit} />}
        {tab === 'tools' && <JarvisBuiltinToolsTab />}
        {tab === 'integrations' && <IntegrationsPanel />}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value?: string | number;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <Icon className="h-4 w-4 text-zinc-400" />
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-20 animate-pulse rounded bg-zinc-100 dark:bg-white/10" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{value ?? 0}</p>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  );
}

function OrganizationsPanel({
  organizations,
  loading,
  onChanged,
}: {
  organizations: SuperAdminOrganization[];
  loading: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [form, setForm] = useState({
    organizationName: '',
    slug: '',
    plan: 'starter',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
  });

  const createMutation = useMutation({
    mutationFn: () => superAdminService.createOrganization(form),
    onSuccess: () => {
      toast.success('Empresa criada');
      setFormOpen(false);
      setForm({ organizationName: '', slug: '', plan: 'starter', ownerName: '', ownerEmail: '', ownerPassword: '' });
      onChanged();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Erro ao criar empresa'),
  });

  const updatePlan = async (org: SuperAdminOrganization, plan: string) => {
    await superAdminService.updateOrganizationPlan(org.id, { plan });
    toast.success('Plano atualizado');
    queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
    queryClient.invalidateQueries({ queryKey: ['super-admin-overview'] });
  };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Empresas</h2>
        <button
          onClick={() => setFormOpen((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nova empresa
        </button>
      </div>

      {formOpen && (
        <div className="mt-4 grid gap-3 rounded-lg border border-dashed border-zinc-300 bg-white p-4 dark:border-white/10 dark:bg-black sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Input label="Empresa" value={form.organizationName} onChange={(v) => setForm({ ...form, organizationName: v })} />
          <Input label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="opcional" />
          <Select label="Plano" value={form.plan} onChange={(v) => setForm({ ...form, plan: v })} options={planOptions} />
          <Input label="Dono" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} />
          <Input label="Email do dono" value={form.ownerEmail} onChange={(v) => setForm({ ...form, ownerEmail: v })} />
          <Input label="Senha inicial" type="password" value={form.ownerPassword} onChange={(v) => setForm({ ...form, ownerPassword: v })} />
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.organizationName || !form.ownerEmail || !form.ownerPassword}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
            >
              Criar empresa e owner
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:bg-white/5">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Cobranca</th>
              <th className="px-4 py-3">Uso</th>
              <th className="px-4 py-3">IA</th>
              <th className="px-4 py-3">Criada</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton cols={9} />
            ) : organizations.length === 0 ? (
              <EmptyRow cols={9} text="Nenhuma empresa encontrada" />
            ) : (
              organizations.map((org) => {
                const owner = org.members.find((member) => member.role === 'OWNER');
                const expanded = expandedOrgId === org.id;
                return (
                <Fragment key={org.id}>
                <tr className="border-b border-zinc-50 dark:border-white/10">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{org.name}</p>
                    <p className="text-xs text-zinc-400">{org.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={org.plan}
                      onChange={(event) => updatePlan(org, event.target.value)}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium capitalize text-zinc-900 dark:border-white/10 dark:bg-black dark:text-zinc-100"
                    >
                      {planOptions.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {owner?.user.name ?? 'Sem owner'}
                    <br />
                    {owner?.user.email}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={org.status} />
                    {org.suspendedReason && (
                      <p className="mt-1 max-w-40 truncate text-xs text-zinc-500">{org.suspendedReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    <p>{org.billingStatus}</p>
                    <p>{formatMoney(org.billingAmountCents, org.billingCurrency)}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {org._count.members} membros · {org._count.channels} canais · {org._count.aiAgents} agentes
                  </td>
                  <td className="px-4 py-3">
                    <AiToggle org={org} onChanged={onChanged} />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{new Date(org.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setExpandedOrgId(expanded ? null : org.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
                    >
                      Gerenciar
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr key={`${org.id}-details`} className="border-b border-zinc-100 dark:border-white/10">
                    <td colSpan={9} className="bg-zinc-50 px-4 py-4 dark:bg-white/5">
                      <OrganizationDetails org={org} onChanged={onChanged} />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CommercialCard({
  org,
  onChanged,
}: {
  org: SuperAdminOrganization;
  onChanged: () => void;
}) {
  // Defaults vêm do template do plano da org; o que estiver em billingProfile
  // (negociado) tem prioridade.
  const { data: plans } = useQuery({
    queryKey: ['super-admin-plan-templates-ref'],
    queryFn: () => superAdminService.planTemplates(),
  });
  const tmpl = plans?.find((p) => p.plan === org.plan)?.settings;
  const bp = org.billingProfile ?? {};

  const [c, setC] = useState({
    seats: '',
    pricePerSeat: '',
    suiteFlat: '',
    aiConversations: '',
    includesMarketing: false,
    includesAssistant: false,
    discountType: 'NONE' as 'NONE' | 'PERCENT' | 'FIXED',
    discountValue: '',
    discountReason: '',
    notes: '',
    initialized: false,
  });

  // Prefill uma vez (quando o template carrega), respeitando o que já foi salvo.
  useEffect(() => {
    if (c.initialized) return;
    if (!tmpl && !org.billingProfile) return;
    const seats = bp.seats ?? tmpl?.minSeats ?? 1;
    const seatCents = bp.pricePerSeatCents ?? tmpl?.pricePerSeatCents ?? 0;
    const suiteCents = bp.suiteFlatCents ?? tmpl?.suiteFlatCents ?? 0;
    const dType = bp.discountType ?? 'NONE';
    setC({
      seats: String(seats),
      pricePerSeat: centsToReaisStr(seatCents),
      suiteFlat: centsToReaisStr(suiteCents),
      aiConversations: String(bp.aiConversations ?? tmpl?.aiConversations ?? 0),
      includesMarketing: bp.includesMarketing ?? tmpl?.includesMarketing ?? false,
      includesAssistant: bp.includesAssistant ?? tmpl?.includesAssistant ?? false,
      discountType: dType,
      discountValue:
        dType === 'FIXED' ? centsToReaisStr(bp.discountValue ?? 0) : String(bp.discountValue ?? ''),
      discountReason: bp.discountReason ?? '',
      notes: bp.notes ?? '',
      initialized: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmpl, org.billingProfile]);

  const set = (k: keyof typeof c, v: string | boolean) => setC((cur) => ({ ...cur, [k]: v }));

  // Cálculo ao vivo
  const seats = Number(c.seats) || 0;
  const seatCents = reaisStrToCents(c.pricePerSeat);
  const suiteCents = reaisStrToCents(c.suiteFlat);
  const base = seatCents * seats + suiteCents;
  const discountCents =
    c.discountType === 'PERCENT'
      ? Math.round((base * (Number(c.discountValue) || 0)) / 100)
      : c.discountType === 'FIXED'
        ? reaisStrToCents(c.discountValue)
        : 0;
  const total = Math.max(0, base - discountCents);

  const buildProfile = () => ({
    seats,
    pricePerSeatCents: seatCents,
    suiteFlatCents: suiteCents,
    aiConversations: Number(c.aiConversations) || 0,
    includesMarketing: c.includesMarketing,
    includesAssistant: c.includesAssistant,
    discountType: c.discountType,
    discountValue:
      c.discountType === 'FIXED' ? reaisStrToCents(c.discountValue) : Number(c.discountValue) || 0,
    discountReason: c.discountReason.trim() || undefined,
    notes: c.notes.trim() || undefined,
    setupFeeCents: tmpl?.setupFeeCents ?? 0,
  });

  const saveProfile = async (applyToBilling: boolean) => {
    await superAdminService.updateBilling(org.id, {
      billingProfile: buildProfile(),
      ...(applyToBilling ? { billingAmountCents: total } : {}),
    });
    toast.success(
      applyToBilling ? `Comercial salvo + cobrança = ${fmtBRL(total)}/mês` : 'Comercial salvo',
    );
    onChanged();
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Comercial — plano negociado & desconto
        </h3>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-600 dark:bg-white/10 dark:text-zinc-100">
          Plano base: {tmpl?.label ?? org.plan}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        Pré-preenchido pelo template do plano. Ajuste por empresa, dê desconto e clique em aplicar —
        nada disso é sobrescrito quando você edita o template do plano.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Atendentes (seats)" value={c.seats} onChange={(v) => set('seats', v)} />
        <Input label="Preço / atendente (R$)" value={c.pricePerSeat} onChange={(v) => set('pricePerSeat', v)} />
        <Input label="Suíte fixa / mês (R$)" value={c.suiteFlat} onChange={(v) => set('suiteFlat', v)} />
        <Input label="Cota IA (conversas/mês)" value={c.aiConversations} onChange={(v) => set('aiConversations', v)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" checked={c.includesMarketing} onChange={(e) => set('includesMarketing', e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20" />
          Marketing incluso (cobrança)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" checked={c.includesAssistant} onChange={(e) => set('includesAssistant', e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20" />
          Assistente incluso (cobrança)
        </label>
        <span className="text-[11px] text-zinc-400">
          (Provisionar de fato é nos toggles de add-on abaixo.)
        </span>
      </div>

      {/* Desconto */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Desconto"
          value={c.discountType}
          onChange={(v) => set('discountType', v)}
          options={['NONE', 'PERCENT', 'FIXED']}
        />
        {c.discountType !== 'NONE' && (
          <Input
            label={c.discountType === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}
            value={c.discountValue}
            onChange={(v) => set('discountValue', v)}
          />
        )}
        {c.discountType !== 'NONE' && (
          <div className="sm:col-span-2">
            <Input
              label="Motivo do desconto (negociação/indicação)"
              value={c.discountReason}
              onChange={(v) => set('discountReason', v)}
              placeholder="ex: indicação do cliente X, fechamento anual…"
            />
          </div>
        )}
      </div>

      {/* Resumo */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-md bg-zinc-50 p-3 dark:bg-white/5">
        <div className="text-xs text-zinc-500">
          <div>
            Base: {fmtBRL(base)} ({seats} × {fmtBRL(seatCents)}{suiteCents > 0 ? ` + ${fmtBRL(suiteCents)} suíte` : ''})
          </div>
          {discountCents > 0 && <div className="text-emerald-600 dark:text-emerald-400">Desconto: − {fmtBRL(discountCents)}</div>}
          <div className="mt-0.5 text-[11px]">Implantação (única): {fmtBRL(tmpl?.setupFeeCents ?? 0)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Total mensal</div>
          <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{fmtBRL(total)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => saveProfile(false)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
        >
          Salvar comercial
        </button>
        <button
          onClick={() => saveProfile(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950"
        >
          <CreditCard className="h-4 w-4" />
          Aplicar ao faturamento ({fmtBRL(total)})
        </button>
      </div>

      {org.billingAmountCents != null && (
        <p className="mt-2 text-[11px] text-zinc-400">
          Cobrança atual gravada: {fmtBRL(org.billingAmountCents)}/{org.billingCycle === 'yearly' ? 'ano' : 'mês'}
        </p>
      )}
    </div>
  );
}

function OrganizationDetails({
  org,
  onChanged,
}: {
  org: SuperAdminOrganization;
  onChanged: () => void;
}) {
  const settings = org.settings ?? {};
  const [limits, setLimits] = useState({
    maxAgents: String(settings.maxAgents ?? ''),
    maxChannels: String(settings.maxChannels ?? ''),
    maxDepartments: String(settings.maxDepartments ?? ''),
    aiMonthlyTokenCap: String(org.aiMonthlyTokenCap ?? ''),
    monthlyConversationLimit: String(org.monthlyConversationLimit ?? ''),
    aiMarketingMonthlyTokenCap: String(org.aiMarketingMonthlyTokenCap ?? ''),
  });
  const [memberForm, setMemberForm] = useState({ email: '', role: 'AGENT' });
  const [billing, setBilling] = useState({
    billingStatus: org.billingStatus,
    billingEmail: org.billingEmail ?? '',
    billingAmountCents: String(org.billingAmountCents ?? ''),
    billingCurrency: org.billingCurrency,
    billingCycle: org.billingCycle,
    billingDueDay: String(org.billingDueDay ?? ''),
    trialEndsAt: toDateInput(org.trialEndsAt),
    currentPeriodEndsAt: toDateInput(org.currentPeriodEndsAt),
  });
  const [suspendReason, setSuspendReason] = useState(org.suspendedReason ?? '');

  const saveLimits = async () => {
    await superAdminService.updateOrganizationPlan(org.id, {
      settings: {
        ...settings,
        maxAgents: toOptionalNumber(limits.maxAgents),
        maxChannels: toOptionalNumber(limits.maxChannels),
        maxDepartments: toOptionalNumber(limits.maxDepartments),
      },
      aiMonthlyTokenCap: toNullableNumber(limits.aiMonthlyTokenCap),
      monthlyConversationLimit: toNullableNumber(limits.monthlyConversationLimit),
      aiMarketingMonthlyTokenCap: toNullableNumber(limits.aiMarketingMonthlyTokenCap),
    });
    toast.success('Limites atualizados');
    onChanged();
  };

  const addMember = async () => {
    if (!memberForm.email.trim()) return;
    await superAdminService.addOrganizationMember(org.id, {
      email: memberForm.email.trim(),
      role: memberForm.role,
    });
    toast.success('Membro adicionado');
    setMemberForm({ email: '', role: 'AGENT' });
    onChanged();
  };

  const saveBilling = async () => {
    await superAdminService.updateBilling(org.id, {
      billingStatus: billing.billingStatus,
      billingEmail: billing.billingEmail.trim() || null,
      billingAmountCents: toNullableNumber(billing.billingAmountCents),
      billingCurrency: billing.billingCurrency || 'BRL',
      billingCycle: billing.billingCycle || 'monthly',
      billingDueDay: toNullableNumber(billing.billingDueDay),
      trialEndsAt: billing.trialEndsAt || null,
      currentPeriodEndsAt: billing.currentPeriodEndsAt || null,
    });
    toast.success('Cobranca atualizada');
    onChanged();
  };

  const toggleSuspension = async () => {
    if (org.status === 'SUSPENDED') {
      await superAdminService.unsuspendOrganization(org.id);
      toast.success('Empresa reativada');
    } else {
      await superAdminService.suspendOrganization(org.id, suspendReason.trim() || 'Suspensa pelo super admin');
      toast.success('Empresa suspensa');
    }
    onChanged();
  };

  const impersonate = async (member: SuperAdminOrganization['members'][number]) => {
    if (!confirm(`Entrar como ${member.user.name}? Sua sessao admin ficara salva para voltar.`)) return;

    const currentAccessToken = localStorage.getItem('access_token');
    const currentRefreshToken = localStorage.getItem('refresh_token');
    if (currentAccessToken) localStorage.setItem('super_admin_access_token', currentAccessToken);
    if (currentRefreshToken) localStorage.setItem('super_admin_refresh_token', currentRefreshToken);

    const data = await superAdminService.impersonate(org.id, member.userId);
    localStorage.setItem('access_token', data.accessToken);
    localStorage.setItem('refresh_token', data.refreshToken);
    localStorage.setItem('active_org_id', org.id);
    localStorage.setItem('impersonating_user', member.user.email);
    toast.success(`Voce entrou como ${member.user.name}`);
    window.location.href = '/dashboard';
  };

  const updateMemberRole = async (membershipId: string, role: string) => {
    await superAdminService.updateOrganizationMember(org.id, membershipId, { role });
    toast.success('Permissao atualizada');
    onChanged();
  };

  const removeMember = async (membershipId: string, name: string) => {
    if (!confirm(`Remover ${name} desta empresa?`)) return;
    await superAdminService.removeOrganizationMember(org.id, membershipId);
    toast.success('Membro removido');
    onChanged();
  };

  return (
    <div className="space-y-4">
    <CommercialCard org={org} onChanged={onChanged} />
    <div className="grid gap-4 xl:grid-cols-[320px_320px_1fr]">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Limites da empresa</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Input label="Max. agentes IA" value={limits.maxAgents} onChange={(v) => setLimits({ ...limits, maxAgents: v })} />
          <Input label="Max. canais" value={limits.maxChannels} onChange={(v) => setLimits({ ...limits, maxChannels: v })} />
          <Input label="Max. departamentos" value={limits.maxDepartments} onChange={(v) => setLimits({ ...limits, maxDepartments: v })} />
          <Input label="Cap mensal tokens IA" value={limits.aiMonthlyTokenCap} onChange={(v) => setLimits({ ...limits, aiMonthlyTokenCap: v })} placeholder="sem limite" />
          <Input label="Limite mensal conversas IA" value={limits.monthlyConversationLimit} onChange={(v) => setLimits({ ...limits, monthlyConversationLimit: v })} placeholder="ilimitado" />
          <Input label="Cap mensal tokens IA — Marketing" value={limits.aiMarketingMonthlyTokenCap} onChange={(v) => setLimits({ ...limits, aiMarketingMonthlyTokenCap: v })} placeholder="sem limite" />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-white/10">
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Módulo Marketing</p>
            <p className="text-[11px] text-zinc-400">Add-on: libera o menu e agentes de marketing.</p>
          </div>
          <MarketingToggle org={org} onChanged={onChanged} />
        </div>
        <button
          onClick={saveLimits}
          className="mt-4 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
        >
          Salvar limites
        </button>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Cobranca e bloqueio</h3>
        </div>
        <div className="mt-3 grid gap-3">
          <Select label="Status cobranca" value={billing.billingStatus} onChange={(v) => setBilling({ ...billing, billingStatus: v as BillingStatus })} options={billingStatusOptions} />
          <Input label="Email cobranca" value={billing.billingEmail} onChange={(v) => setBilling({ ...billing, billingEmail: v })} />
          <Input label="Valor em centavos" value={billing.billingAmountCents} onChange={(v) => setBilling({ ...billing, billingAmountCents: v })} placeholder="ex: 9900" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Moeda" value={billing.billingCurrency} onChange={(v) => setBilling({ ...billing, billingCurrency: v })} />
            <Input label="Dia venc." value={billing.billingDueDay} onChange={(v) => setBilling({ ...billing, billingDueDay: v })} />
          </div>
          <Input label="Fim periodo" type="date" value={billing.currentPeriodEndsAt} onChange={(v) => setBilling({ ...billing, currentPeriodEndsAt: v })} />
          <Input label="Fim trial" type="date" value={billing.trialEndsAt} onChange={(v) => setBilling({ ...billing, trialEndsAt: v })} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={saveBilling}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950"
          >
            <CreditCard className="h-4 w-4" />
            Salvar
          </button>
        </div>
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-white/10">
          <Input label="Motivo da suspensao" value={suspendReason} onChange={setSuspendReason} placeholder="inadimplencia, abuso, cancelamento..." />
          <button
            onClick={toggleSuspension}
            className={`mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${
              org.status === 'SUSPENDED'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {org.status === 'SUSPENDED' ? <RefreshCw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {org.status === 'SUSPENDED' ? 'Reativar empresa' : 'Suspender empresa'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Input label="Adicionar usuario por email" value={memberForm.email} onChange={(v) => setMemberForm({ ...memberForm, email: v })} />
          </div>
          <Select label="Role" value={memberForm.role} onChange={(v) => setMemberForm({ ...memberForm, role: v })} options={['OWNER', 'ADMIN', 'AGENT']} />
          <button
            onClick={addMember}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Adicionar
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-zinc-100 dark:border-white/10">
          <table className="w-full text-sm">
            <tbody>
              {org.members.map((member) => (
                <tr key={member.id} className="border-b border-zinc-50 last:border-b-0 dark:border-white/10">
                  <td className="px-3 py-2">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{member.user.name}</p>
                    <p className="text-xs text-zinc-500">{member.user.email}</p>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={member.role}
                      onChange={(event) => updateMemberRole(member.id, event.target.value)}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium capitalize text-zinc-900 dark:border-white/10 dark:bg-black dark:text-zinc-100"
                    >
                      {['OWNER', 'ADMIN', 'AGENT'].map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {member.user.isActive ? 'Ativo' : 'Inativo'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => impersonate(member)}
                      className="mr-1 rounded p-1.5 text-zinc-400 hover:bg-primary/10 hover:text-primary"
                      title="Entrar como este usuario"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeMember(member.id, member.user.name)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </div>
  );
}

function UsersPanel({
  users,
  organizations,
  loading,
  onChanged,
}: {
  users: SuperAdminUser[];
  organizations: SuperAdminOrganization[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SuperAdminUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', isSuperAdmin: true });

  const { data: allOrganizations } = useQuery({
    queryKey: ['super-admin-organizations-all'],
    queryFn: () => superAdminService.organizations(),
  });

  const orgPickerOptions = allOrganizations ?? organizations;

  const createMutation = useMutation({
    mutationFn: () => superAdminService.createUser(form),
    onSuccess: () => {
      toast.success('Usuario criado');
      setFormOpen(false);
      setForm({ name: '', email: '', password: '', isSuperAdmin: true });
      onChanged();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Erro ao criar usuario'),
  });

  const updateUser = async (id: string, payload: { isActive?: boolean; isSuperAdmin?: boolean }) => {
    await superAdminService.updateUserStatus(id, payload);
    toast.success('Usuario atualizado');
    onChanged();
  };

  return (
    <section className="mt-6">
      <EditUserDialog
        user={editingUser}
        organizations={orgPickerOptions}
        onClose={() => setEditingUser(null)}
        onSaved={onChanged}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Usuarios</h2>
        <button
          onClick={() => setFormOpen((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Novo usuario
        </button>
      </div>

      {formOpen && (
        <div className="mt-4 grid gap-3 rounded-lg border border-dashed border-zinc-300 bg-white p-4 dark:border-white/10 dark:bg-black md:grid-cols-4">
          <Input label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Input label="Senha" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <label className="flex items-end gap-2 pb-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={form.isSuperAdmin}
              onChange={(event) => setForm({ ...form, isSuperAdmin: event.target.checked })}
            />
            Super admin
          </label>
          <div className="md:col-span-4">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.name || !form.email || !form.password}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
            >
              Criar usuario
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:bg-white/5">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Empresas</th>
              <th className="px-4 py-3">Super admin</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criado</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton cols={6} />
            ) : users.length === 0 ? (
              <EmptyRow cols={6} text="Nenhum usuario encontrado" />
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-50 dark:border-white/10">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{u.name}</p>
                    <p className="text-xs text-zinc-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {u.organizations.length === 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">Sem empresa</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.organizations.map((m) => (
                          <span
                            key={m.id ?? `${u.id}:${m.organization.id}`}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
                          >
                            {m.organization.name} ({m.role})
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => updateUser(u.id, { isSuperAdmin: !u.isSuperAdmin })} className="text-zinc-500 hover:text-primary">
                      {u.isSuperAdmin ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateUser(u.id, { isActive: !u.isActive })}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                        u.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {u.isActive ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditingUser(u)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                      title="Editar usuario"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Helpers de dinheiro (BRL, centavos ↔ reais) ──
const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const centsToReaisStr = (cents: number) => String(cents / 100);
const reaisStrToCents = (s: string) => {
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

type PlanDraft = {
  label: string;
  description: string;
  pricePerSeat: string;
  minSeats: string;
  suiteFlat: string;
  aiConversations: string;
  includesMarketing: boolean;
  includesAssistant: boolean;
  setupFee: string;
  maxAgents: string;
  maxChannels: string;
  maxDepartments: string;
};

function PlansPanel({
  overview,
  onChanged,
}: {
  overview?: SuperAdminOverview;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({});
  const [applyToExisting, setApplyToExisting] = useState<Record<string, boolean>>({});

  const planCounts = overview?.plans;

  const { data: plans = DEFAULT_PLAN_TEMPLATES, isLoading } = useQuery({
    queryKey: ['super-admin-plan-templates', planCounts],
    queryFn: () => superAdminService.planTemplates(planCounts),
  });

  useEffect(() => {
    if (!plans.length) return;
    setDrafts(
      Object.fromEntries(
        plans.map((item) => {
          const s = item.settings;
          return [
            item.plan,
            {
              label: s.label,
              description: s.description,
              pricePerSeat: centsToReaisStr(s.pricePerSeatCents),
              minSeats: String(s.minSeats),
              suiteFlat: centsToReaisStr(s.suiteFlatCents),
              aiConversations: String(s.aiConversations),
              includesMarketing: s.includesMarketing,
              includesAssistant: s.includesAssistant,
              setupFee: centsToReaisStr(s.setupFeeCents),
              maxAgents: String(s.maxAgents),
              maxChannels: String(s.maxChannels),
              maxDepartments: String(s.maxDepartments),
            } satisfies PlanDraft,
          ];
        }),
      ),
    );
  }, [plans]);

  const patch = (plan: string, key: keyof PlanDraft, value: string | boolean) =>
    setDrafts((cur) => ({ ...cur, [plan]: { ...cur[plan], [key]: value } }));

  const saveMutation = useMutation({
    mutationFn: (plan: string) => {
      const d = drafts[plan];
      if (!d) throw new Error('Plano invalido');
      return superAdminService.updatePlanTemplate(plan, {
        label: d.label,
        description: d.description,
        pricePerSeatCents: reaisStrToCents(d.pricePerSeat),
        minSeats: Number(d.minSeats) || 0,
        suiteFlatCents: reaisStrToCents(d.suiteFlat),
        aiConversations: Number(d.aiConversations) || 0,
        includesMarketing: d.includesMarketing,
        includesAssistant: d.includesAssistant,
        setupFeeCents: reaisStrToCents(d.setupFee),
        maxAgents: Number(d.maxAgents) || 0,
        maxChannels: Number(d.maxChannels) || 0,
        maxDepartments: Number(d.maxDepartments) || 0,
        applyToExisting: applyToExisting[plan] ?? false,
      });
    },
    onSuccess: (result) => {
      const suffix =
        result.updatedOrganizations > 0
          ? ` — ${result.updatedOrganizations} empresa(s) atualizada(s)`
          : '';
      toast.success(`Plano ${result.plan} salvo${suffix}`);
      queryClient.invalidateQueries({ queryKey: ['super-admin-plan-templates'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      onChanged();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Erro ao salvar plano'),
  });

  if (isLoading && !plans.length) {
    return <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">Carregando planos…</p>;
  }

  return (
    <section className="mt-6 space-y-6">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Catálogo comercial do AxChat. Cobrança <strong>por atendente</strong> + cota de IA; Marketing e
        Assistente são caixas fixas por org. Sem plano grátis — trial de 7 dias. Preços em reais.
      </p>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {plans.map((item) => {
          const d = drafts[item.plan];
          const saving = saveMutation.isPending && saveMutation.variables === item.plan;
          // Exemplo: mensalidade no mínimo de atendentes.
          const seatCents = reaisStrToCents(d?.pricePerSeat ?? '0');
          const suiteCents = reaisStrToCents(d?.suiteFlat ?? '0');
          const minSeats = Number(d?.minSeats) || 0;
          const monthlyMin = seatCents * minSeats + suiteCents;
          return (
            <div
              key={item.plan}
              className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="rounded-md bg-primary px-2.5 py-1 text-sm font-semibold text-primary-foreground">
                  {d?.label || item.plan}
                </h2>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-100">
                  {item.count} empresas
                </span>
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400">{item.plan}</p>

              {/* Resumo calculado */}
              <div className="mt-3 rounded-md bg-zinc-50 p-2.5 text-xs dark:bg-white/5">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {fmtBRL(seatCents)} <span className="font-normal text-zinc-500">/atendente</span>
                </div>
                {suiteCents > 0 && (
                  <div className="text-zinc-500">+ {fmtBRL(suiteCents)} suíte fixa/mês</div>
                )}
                <div className="mt-1 text-zinc-500">
                  Mín. {minSeats} atend. → <strong className="text-zinc-700 dark:text-zinc-300">{fmtBRL(monthlyMin)}/mês</strong>
                </div>
                <div className="text-zinc-500">Implantação: {fmtBRL(reaisStrToCents(d?.setupFee ?? '0'))}</div>
              </div>

              <div className="mt-3 space-y-2.5">
                <TextField label="Nome" value={d?.label ?? ''} onChange={(v) => patch(item.plan, 'label', v)} />
                <MoneyField label="Preço / atendente (R$)" value={d?.pricePerSeat ?? ''} onChange={(v) => patch(item.plan, 'pricePerSeat', v)} />
                <PlanLimitInput label="Mín. atendentes" value={d?.minSeats ?? ''} onChange={(v) => patch(item.plan, 'minSeats', v)} />
                <PlanLimitInput label="Cota IA (conversas/mês)" value={d?.aiConversations ?? ''} onChange={(v) => patch(item.plan, 'aiConversations', v)} />
                <MoneyField label="Suíte fixa /mês (R$)" value={d?.suiteFlat ?? ''} onChange={(v) => patch(item.plan, 'suiteFlat', v)} />
                <MoneyField label="Implantação (R$)" value={d?.setupFee ?? ''} onChange={(v) => patch(item.plan, 'setupFee', v)} />

                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <input type="checkbox" checked={d?.includesMarketing ?? false} onChange={(e) => patch(item.plan, 'includesMarketing', e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20" />
                  Marketing incluso
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <input type="checkbox" checked={d?.includesAssistant ?? false} onChange={(e) => patch(item.plan, 'includesAssistant', e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20" />
                  Assistente incluso
                </label>

                <details className="text-xs text-zinc-500">
                  <summary className="cursor-pointer select-none">Limites operacionais</summary>
                  <div className="mt-2 space-y-2.5">
                    <PlanLimitInput label="Máx. agentes IA" value={d?.maxAgents ?? ''} onChange={(v) => patch(item.plan, 'maxAgents', v)} />
                    <PlanLimitInput label="Máx. canais" value={d?.maxChannels ?? ''} onChange={(v) => patch(item.plan, 'maxChannels', v)} />
                    <PlanLimitInput label="Máx. departamentos" value={d?.maxDepartments ?? ''} onChange={(v) => patch(item.plan, 'maxDepartments', v)} />
                  </div>
                </details>
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={applyToExisting[item.plan] ?? false}
                  onChange={(event) =>
                    setApplyToExisting((current) => ({ ...current, [item.plan]: event.target.checked }))
                  }
                  className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
                />
                Aplicar limites operacionais às {item.count} empresa(s)
              </label>

              <button
                type="button"
                onClick={() => saveMutation.mutate(item.plan)}
                disabled={!d || saving}
                className="mt-auto w-full rounded-md bg-primary px-3 py-2 pt-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Salvar plano'}
              </button>
            </div>
          );
        })}
      </div>

      <PricingMetaCard />
    </section>
  );
}

function PricingMetaCard() {
  const queryClient = useQueryClient();
  const { data: meta, isLoading } = useQuery({
    queryKey: ['super-admin-pricing-meta'],
    queryFn: superAdminService.pricingMeta,
  });
  const [notes, setNotes] = useState('');
  const [trialDays, setTrialDays] = useState('7');

  useEffect(() => {
    if (meta) {
      setNotes(meta.notes);
      setTrialDays(String(meta.trialDays));
    }
  }, [meta]);

  const save = useMutation({
    mutationFn: () =>
      superAdminService.updatePricingMeta({ notes, trialDays: Number(trialDays) || 0 }),
    onSuccess: () => {
      toast.success('Referência comercial salva');
      queryClient.invalidateQueries({ queryKey: ['super-admin-pricing-meta'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
  });

  if (isLoading || !meta) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Carregando referência comercial…</p>;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Referência comercial (add-ons, pacotes de IA & notas)
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Anotações de apoio à venda — não é landing page. Trial de {meta.trialDays} dias, sem plano grátis.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add-ons avulsos (caixa fixa/org)</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {meta.addons.map((a) => (
              <li key={a.key} className="rounded-md bg-zinc-50 px-3 py-2 dark:bg-white/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-800 dark:text-zinc-200">{a.label}</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{fmtBRL(a.priceCents)}/mês</span>
                </div>
                {a.note && <p className="mt-0.5 text-xs text-zinc-500">{a.note}</p>}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pacotes de IA extra (avulso)</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {meta.aiPackages.map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-3 py-2 dark:bg-white/5">
                <span className="text-zinc-800 dark:text-zinc-200">{p.label}</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{fmtBRL(p.priceCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr] sm:items-start">
        <PlanLimitInput label="Trial (dias)" value={trialDays} onChange={setTrialDays} />
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Notas comerciais</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {save.isPending ? 'Salvando…' : 'Salvar referência'}
      </button>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
      />
    </label>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
      />
    </label>
  );
}

function PlanLimitInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
      />
    </label>
  );
}

function IntegrationsPanel() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['super-admin-meta-coexistence'],
    queryFn: superAdminService.getMetaCoexistence,
  });

  const [appId, setAppId] = useState('');
  const [configId, setConfigId] = useState('');
  const [embeddedConfigId, setEmbeddedConfigId] = useState('');
  const [appSecret, setAppSecret] = useState('');

  useEffect(() => {
    if (config) {
      setAppId(config.appId);
      setConfigId(config.configId);
      setEmbeddedConfigId(config.embeddedConfigId ?? '');
      setAppSecret('');
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () =>
      superAdminService.updateMetaCoexistence({
        appId: appId.trim(),
        configId: configId.trim(),
        embeddedConfigId: embeddedConfigId.trim(),
        // Só envia o secret se o usuário digitou algo novo.
        ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Configuração do Meta salva');
      setAppSecret('');
      queryClient.invalidateQueries({ queryKey: ['super-admin-meta-coexistence'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Erro ao salvar'),
  });

  const enabled = !!(appId.trim() && configId.trim() && (config?.hasSecret || appSecret.trim()));

  return (
    <section className="mt-6 max-w-2xl">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          WhatsApp — App Meta (Embedded Signup)
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Credenciais do app Meta da plataforma (Tech Provider). Válidas para
          todos os clientes. Dois Config IDs: um para o fluxo de{' '}
          <strong>Coexistência (QR)</strong> e outro para o{' '}
          <strong>Login Facebook padrão</strong> (criar/selecionar número).
        </p>

        <div className="mt-4 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              enabled
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
            }`}
          >
            {enabled ? 'Coexistência habilitada' : 'Incompleto — coexistência desabilitada'}
          </span>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-zinc-400">Carregando…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <Input label="Meta App ID" value={appId} onChange={setAppId} placeholder="ex: 123456789012345" />
            <div>
              <Input label="Config ID — Coexistência (QR)" value={configId} onChange={setConfigId} placeholder="config_id da configuração de coexistência" />
              <p className="mt-1 text-[11px] text-zinc-400">
                Configuração de Embedded Signup com o fluxo de QR Code (número segue no celular).
              </p>
            </div>
            <div>
              <Input label="Config ID — Login Facebook padrão" value={embeddedConfigId} onChange={setEmbeddedConfigId} placeholder="config_id do Embedded Signup padrão (se vazio, usa o de coexistência)" />
              <p className="mt-1 text-[11px] text-zinc-400">
                Configuração de Embedded Signup padrão (criar/selecionar WABA + número). Deixe vazio para reutilizar o Config ID de coexistência.
              </p>
            </div>
            <div>
              <Input
                label="Meta App Secret"
                type="password"
                value={appSecret}
                onChange={setAppSecret}
                placeholder={config?.hasSecret ? '•••••••• (salvo — preencha só para trocar)' : 'cole o App Secret'}
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                {config?.hasSecret
                  ? 'Já existe um secret salvo. Deixe em branco para mantê-lo.'
                  : 'O secret nunca é exibido depois de salvo.'}
              </p>
            </div>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !appId.trim() || !configId.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Salvando…' : 'Salvar configuração'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function AuditPanel({
  logs,
  loading,
}: {
  logs: SuperAdminAuditLog[];
  loading: boolean;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-white/10">
        <History className="h-4 w-4 text-zinc-400" />
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Auditoria do Super Admin</h2>
      </div>
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/5">
          <tr>
            <th className="px-4 py-3">Quando</th>
            <th className="px-4 py-3">Ator</th>
            <th className="px-4 py-3">Acao</th>
            <th className="px-4 py-3">Empresa</th>
            <th className="px-4 py-3">Alvo</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton cols={5} />
          ) : logs.length === 0 ? (
            <EmptyRow cols={5} text="Nenhum evento registrado" />
          ) : (
            logs.map((log) => (
              <tr key={log.id} className="border-t border-zinc-100 dark:border-white/10">
                <td className="px-4 py-3 text-xs text-zinc-500">{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{log.actor?.name ?? 'Sistema'}</p>
                  <p className="text-xs text-zinc-500">{log.actor?.email}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{log.action}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{log.organization?.name ?? '-'}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{log.targetType} {log.targetId?.slice(0, 8)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function AiToggle({ org, onChanged }: { org: SuperAdminOrganization; onChanged: () => void }) {
  const toggle = async () => {
    await superAdminService.updateOrganizationPlan(org.id, { aiEnabled: !org.aiEnabled });
    toast.success(org.aiEnabled ? 'IA desligada' : 'IA ligada');
    onChanged();
  };
  return (
    <button onClick={toggle} className="text-zinc-500 hover:text-primary">
      {org.aiEnabled ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
    </button>
  );
}

function MarketingToggle({ org, onChanged }: { org: SuperAdminOrganization; onChanged: () => void }) {
  const toggle = async () => {
    await superAdminService.updateOrganizationPlan(org.id, { marketingEnabled: !org.marketingEnabled });
    toast.success(org.marketingEnabled ? 'Marketing desligado' : 'Marketing ligado');
    onChanged();
  };
  return (
    <button onClick={toggle} className="text-zinc-500 hover:text-primary">
      {org.marketingEnabled ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
    </button>
  );
}

function StatusBadge({ status }: { status: SuperAdminOrganization['status'] }) {
  const className =
    status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
      : status === 'SUSPENDED'
        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
        : 'bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200';

  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{status}</span>;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, row) => (
        <tr key={row}>
          {Array.from({ length: cols }).map((__, col) => (
            <td key={col} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-zinc-100 dark:bg-black" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-sm text-zinc-500">{text}</td>
    </tr>
  );
}

function toOptionalNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : undefined;
}

function toNullableNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : null;
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function formatMoney(value: number | null, currency = 'BRL') {
  if (value === null || value === undefined) return 'Sem valor';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value / 100);
}
