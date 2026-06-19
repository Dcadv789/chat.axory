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
import { DepartmentsPanel } from '@/features/super-admin/components/departments-panel';
import { JarvisBuiltinToolsTab } from '@/features/ai-agents/components/jarvis/builtin-tools-tab';
import { useAuthStore } from '@/stores/auth-store';

const planOptions = ['free', 'starter', 'pro', 'enterprise'];
const billingStatusOptions: BillingStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXEMPT'];

export default function SuperAdminPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'organizations' | 'users' | 'agents' | 'departments' | 'plans' | 'audit' | 'tools'>('organizations');
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
            <Tab active={tab === 'departments'} onClick={() => setTab('departments')}>Departamentos</Tab>
            <Tab active={tab === 'plans'} onClick={() => setTab('plans')}>Planos</Tab>
            <Tab active={tab === 'audit'} onClick={() => setTab('audit')}>Auditoria</Tab>
            <Tab active={tab === 'tools'} onClick={() => setTab('tools')}>Tools do sistema</Tab>
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
        {tab === 'departments' && (
          <DepartmentsPanel onChanged={refresh} />
        )}
        {tab === 'plans' && <PlansPanel overview={overview} onChanged={refresh} />}
        {tab === 'audit' && <AuditPanel logs={auditLogs} loading={loadingAudit} />}
        {tab === 'tools' && <JarvisBuiltinToolsTab />}
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
    <div className="grid gap-4 xl:grid-cols-[320px_320px_1fr]">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Limites da empresa</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Input label="Max. agentes IA" value={limits.maxAgents} onChange={(v) => setLimits({ ...limits, maxAgents: v })} />
          <Input label="Max. canais" value={limits.maxChannels} onChange={(v) => setLimits({ ...limits, maxChannels: v })} />
          <Input label="Max. departamentos" value={limits.maxDepartments} onChange={(v) => setLimits({ ...limits, maxDepartments: v })} />
          <Input label="Cap mensal tokens IA" value={limits.aiMonthlyTokenCap} onChange={(v) => setLimits({ ...limits, aiMonthlyTokenCap: v })} placeholder="sem limite" />
          <Input label="Limite mensal conversas IA" value={limits.monthlyConversationLimit} onChange={(v) => setLimits({ ...limits, monthlyConversationLimit: v })} placeholder="ilimitado" />
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

function PlansPanel({
  overview,
  onChanged,
}: {
  overview?: SuperAdminOverview;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { maxAgents: string; maxChannels: string; maxDepartments: string }>>({});
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
        plans.map((item) => [
          item.plan,
          {
            maxAgents: String(item.settings.maxAgents),
            maxChannels: String(item.settings.maxChannels),
            maxDepartments: String(item.settings.maxDepartments),
          },
        ]),
      ),
    );
  }, [plans]);

  const saveMutation = useMutation({
    mutationFn: (plan: string) => {
      const draft = drafts[plan];
      if (!draft) throw new Error('Plano invalido');
      return superAdminService.updatePlanTemplate(plan, {
        maxAgents: Number(draft.maxAgents),
        maxChannels: Number(draft.maxChannels),
        maxDepartments: Number(draft.maxDepartments),
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
    <section className="mt-6">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {plans.map((item) => {
        const draft = drafts[item.plan];
        const saving = saveMutation.isPending && saveMutation.variables === item.plan;
        return (
          <div key={item.plan} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="flex items-center justify-between gap-2">
              <h2 className="rounded-md bg-primary px-2.5 py-1 text-sm font-semibold capitalize text-primary-foreground">
                {item.plan}
              </h2>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-100">
                {item.count} empresas
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <PlanLimitInput
                label="Agentes"
                value={draft?.maxAgents ?? ''}
                onChange={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [item.plan]: {
                      maxAgents: value,
                      maxChannels: current[item.plan]?.maxChannels ?? String(item.settings.maxChannels),
                      maxDepartments: current[item.plan]?.maxDepartments ?? String(item.settings.maxDepartments),
                    },
                  }))
                }
              />
              <PlanLimitInput
                label="Canais"
                value={draft?.maxChannels ?? ''}
                onChange={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [item.plan]: {
                      maxAgents: current[item.plan]?.maxAgents ?? String(item.settings.maxAgents),
                      maxChannels: value,
                      maxDepartments: current[item.plan]?.maxDepartments ?? String(item.settings.maxDepartments),
                    },
                  }))
                }
              />
              <PlanLimitInput
                label="Departamentos"
                value={draft?.maxDepartments ?? ''}
                onChange={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [item.plan]: {
                      maxAgents: current[item.plan]?.maxAgents ?? String(item.settings.maxAgents),
                      maxChannels: current[item.plan]?.maxChannels ?? String(item.settings.maxChannels),
                      maxDepartments: value,
                    },
                  }))
                }
              />
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={applyToExisting[item.plan] ?? false}
                onChange={(event) =>
                  setApplyToExisting((current) => ({
                    ...current,
                    [item.plan]: event.target.checked,
                  }))
                }
                className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
              />
              Aplicar limites às {item.count} empresa(s) neste plano
            </label>

            <button
              type="button"
              onClick={() => saveMutation.mutate(item.plan)}
              disabled={!draft || saving}
              className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Atualizar dados'}
            </button>
          </div>
        );
      })}
      </div>
    </section>
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
