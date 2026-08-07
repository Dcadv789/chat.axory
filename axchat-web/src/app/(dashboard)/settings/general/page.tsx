'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, CreditCard, Users, Check, Loader2, Megaphone, Sparkles,
  CalendarClock, Hash, Crown, Shield, User as UserIcon, Trash2, UserPlus,
  Network, Tags as TagsIcon, Bell, Zap, Workflow,
} from 'lucide-react';
import { organizationService, type BillingStatus } from '@/features/settings/services/organization.service';
import { membersService, type Member } from '@/features/settings/services/members.service';
import { MemberChannelsDrawer } from '@/features/settings/components/member-channels-drawer';
import { InviteMemberDrawer } from '@/features/settings/components/invite-member-drawer';
import { SectorsManager } from '@/features/settings/components/sectors-manager';
import { TagsManager } from '@/features/settings/components/tags-manager';
import { NotificationsManager } from '@/features/settings/components/notifications-manager';
import { QuickRepliesManager } from '@/features/settings/components/quick-replies-manager';
import { authService } from '@/features/auth/services/auth.service';
import { useAuthStore } from '@/stores/auth-store';
import { useOrgId } from '@/hooks/use-org-query-key';
import { Avatar } from '@/components/ui/avatar';

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuito',
  inbox: 'Inbox',
  essencial: 'Essencial',
  profissional: 'Profissional',
  performance: 'Performance',
};

const BILLING_STATUS: Record<BillingStatus, { label: string; cls: string }> = {
  TRIALING: { label: 'Em teste', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  ACTIVE: { label: 'Ativo', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  PAST_DUE: { label: 'Pagamento atrasado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300' },
  EXEMPT: { label: 'Isento', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
};

const ROLE_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  OWNER: { label: 'Dono', icon: Crown, cls: 'bg-primary/10 text-primary' },
  ADMIN: { label: 'Admin', icon: Shield, cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  AGENT: { label: 'Agente', icon: UserIcon, cls: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300' },
};

const brl = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function SectionCard({
  icon: Icon, title, subtitle, action, children,
}: {
  icon: React.ElementType; title: string; subtitle?: string;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3.5 dark:border-white/10">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">{children}</span>
    </div>
  );
}

export default function SettingsGeneralPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  const activeOrg = useAuthStore((s) => s.organizations.find((o) => o.id === s.activeOrgId));
  const isAdmin = activeOrg?.role === 'OWNER' || activeOrg?.role === 'ADMIN';

  const { data: org, isLoading: loadingOrg } = useQuery({
    queryKey: ['organization', 'current', orgId],
    queryFn: () => organizationService.getCurrent(),
  });
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => membersService.list(),
  });

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (org?.name) setName(org.name); }, [org?.name]);

  const nameDirty = org ? name.trim() !== org.name && name.trim().length > 0 : false;

  const handleSaveName = async () => {
    if (!nameDirty) return;
    setSaving(true);
    try {
      await organizationService.update({ name: name.trim() });
      // Recarrega auth pra atualizar o nome na sidebar/topo também.
      const me = await authService.getMe();
      setAuth(me.user, me.organizations);
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
      toast.success('Nome da empresa atualizado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  // ─── Motor de automações ────────────────────────────────────────
  // Salva na hora: é um interruptor, não um formulário. O estado local
  // segura o valor enquanto o PATCH está no ar pra chave não "pular" de volta.
  const [automationsOn, setAutomationsOn] = useState(false);
  const [savingAutomations, setSavingAutomations] = useState(false);
  useEffect(() => {
    if (org) setAutomationsOn(org.automationsEnabled);
  }, [org?.automationsEnabled]);

  const handleToggleAutomations = async (value: boolean) => {
    setAutomationsOn(value);
    setSavingAutomations(true);
    try {
      await organizationService.update({ automationsEnabled: value });
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
      queryClient.invalidateQueries({ queryKey: ['automations-engine'] });
      toast.success(value ? 'Automações ligadas' : 'Automações desligadas');
    } catch (err) {
      setAutomationsOn(!value);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSavingAutomations(false);
    }
  };

  // ─── Gestão de membros (convidar / papel / canais / remover) ───
  const [inviteOpen, setInviteOpen] = useState(false);
  const [drawerMember, setDrawerMember] = useState<Member | null>(null);
  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: ['members'] });

  const handleChangeRole = async (memberId: string, role: string) => {
    try {
      await membersService.updateRole(memberId, role);
      toast.success('Papel atualizado');
      refreshMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar papel');
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remover ${memberName} da organização?`)) return;
    try {
      await membersService.remove(memberId);
      toast.success('Membro removido');
      refreshMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover');
    }
  };

  const bp = org?.billingProfile ?? null;
  const seats = bp?.seats;
  const addons = [
    org?.marketingEnabled && { key: 'marketing', label: 'Marketing', icon: Megaphone },
    org?.assistantEnabled && { key: 'assistant', label: 'Assistente Pessoal', icon: Sparkles },
  ].filter(Boolean) as { key: string; label: string; icon: React.ElementType }[];

  const planLabel = org ? (PLAN_LABELS[org.plan] ?? org.plan) : '—';
  const status = org ? BILLING_STATUS[org.billingStatus] : undefined;
  const renewalDate = org?.billingStatus === 'TRIALING' ? org?.trialEndsAt : org?.currentPeriodEndsAt;
  const renewalLabel = org?.billingStatus === 'TRIALING' ? 'Fim do teste' : 'Próxima renovação';

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {/* Coluna esquerda: empresa + plano + setores */}
      <div className="space-y-4">
        <SectionCard icon={Building2} title="Empresa" subtitle="Dados da sua organização">
          {loadingOrg || !org ? (
            <div className="space-y-4">
              <div className="h-9 animate-pulse rounded-md bg-zinc-100 dark:bg-white/5" />
              <div className="space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-zinc-100 dark:bg-white/5" />
                <div className="h-4 w-56 animate-pulse rounded bg-zinc-100 dark:bg-white/5" />
                <div className="h-4 w-32 animate-pulse rounded bg-zinc-100 dark:bg-white/5" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Nome da empresa
                </label>
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isAdmin || saving}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                  />
                  {isAdmin && (
                    <button
                      onClick={handleSaveName}
                      disabled={!nameDirty || saving}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Salvar
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-white/5">
                <InfoRow label="Identificador">
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-500">
                    <Hash className="h-3 w-3" />{org.slug}
                  </span>
                </InfoRow>
                <InfoRow label="Cliente desde">{fmtDate(org.createdAt)}</InfoRow>
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm text-zinc-500">Add-ons</span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {addons.length === 0 ? (
                      <span className="text-sm text-zinc-400">Nenhum</span>
                    ) : (
                      addons.map((a) => (
                        <span
                          key={a.key}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary dark:bg-blue-400/15 dark:text-blue-300"
                        >
                          <a.icon className="h-3 w-3" />{a.label}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={CreditCard} title="Plano" subtitle="Assinatura e cobrança">
          {loadingOrg || !org ? (
            <div className="space-y-4">
              <div className="h-7 w-24 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />
              <div className="space-y-2">
                <div className="h-4 w-48 animate-pulse rounded bg-zinc-100 dark:bg-white/5" />
                <div className="h-4 w-36 animate-pulse rounded bg-zinc-100 dark:bg-white/5" />
                <div className="h-4 w-52 animate-pulse rounded bg-zinc-100 dark:bg-white/5" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-primary px-2.5 py-1 text-sm font-semibold text-primary-foreground">
                    {planLabel}
                  </span>
                  {status && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>
                      {status.label}
                    </span>
                  )}
                </div>
                {org.billingAmountCents != null && (
                  <div className="text-right">
                    <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {brl(org.billingAmountCents)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      /{org.billingCycle === 'yearly' ? 'ano' : 'mês'}
                    </span>
                  </div>
                )}
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-white/5">
                {seats != null && (
                  <InfoRow label="Assentos (atendentes)">
                    {members.length} de {seats}
                  </InfoRow>
                )}
                {bp?.aiConversations != null && (
                  <InfoRow label="Conversas de IA / mês">{bp.aiConversations.toLocaleString('pt-BR')}</InfoRow>
                )}
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="inline-flex items-center gap-1.5 text-sm text-zinc-500">
                    <CalendarClock className="h-3.5 w-3.5" />{renewalLabel}
                  </span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{fmtDate(renewalDate)}</span>
                </div>
              </div>

              <p className="text-xs text-zinc-400">
                Para trocar de plano, contratar add-ons ou ajustar assentos, fale com o suporte da Axory.
              </p>
            </div>
          )}
        </SectionCard>

        {/* Automações — a chave que faz as regras da página /automations rodarem */}
        <SectionCard
          icon={Workflow}
          title="Automações"
          subtitle="Regras que reagem sozinhas a eventos do atendimento"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {automationsOn ? 'Motor ligado' : 'Motor desligado'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {automationsOn
                  ? 'Suas automações ativas rodam quando o evento acontece.'
                  : 'As automações continuam salvas, mas nenhuma vai rodar até você ligar aqui.'}
              </p>
            </div>
            {isAdmin ? (
              <button
                onClick={() => handleToggleAutomations(!automationsOn)}
                disabled={savingAutomations || loadingOrg}
                type="button"
                aria-label={automationsOn ? 'Desligar automações' : 'Ligar automações'}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  automationsOn ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                    automationsOn ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            ) : (
              <span className="shrink-0 text-xs text-zinc-400">
                {automationsOn ? 'Ligado' : 'Desligado'}
              </span>
            )}
          </div>
        </SectionCard>

        {/* Setores — meia largura, na coluna esquerda */}
        <SectionCard icon={Network} title="Setores" subtitle="Filas humanas e quem atende cada uma">
          <SectorsManager />
        </SectionCard>

        {/* Atalhos — abaixo de setores, na coluna esquerda */}
        <SectionCard icon={Zap} title="Atalhos" subtitle="Respostas rápidas com /comandos no chat">
          <QuickRepliesManager />
        </SectionCard>
      </div>

      {/* Coluna direita: membros + tags */}
      <div className="space-y-4">
      <SectionCard
        icon={Users}
        title="Membros"
        subtitle={`${members.length} ${members.length === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}`}
        action={
          isAdmin ? (
            <button
              onClick={() => setInviteOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="h-3.5 w-3.5" /> Adicionar
            </button>
          ) : undefined
        }
      >
        {loadingMembers ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Users className="h-10 w-10 text-zinc-200 dark:text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-500">Nenhum membro cadastrado</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {members.map((m) => {
              const role = ROLE_META[m.role] ?? ROLE_META.AGENT;
              const editable = isAdmin && m.role !== 'OWNER';
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
                >
                  <Avatar
                    src={m.user.avatarUrl ?? undefined}
                    initials={m.user.name?.slice(0, 2).toUpperCase()}
                    className="size-9 shrink-0"
                    square
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {m.user.name}
                      </span>
                      {!m.user.isActive && (
                        <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                          inativo
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{m.user.email}</p>
                  </div>

                  {editable ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.id, e.target.value)}
                        aria-label="Papel do membro"
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="AGENT">Agente</option>
                      </select>
                      <button
                        onClick={() => setDrawerMember(m)}
                        title="Gerenciar canais"
                        className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-zinc-300"
                      >
                        <Hash className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveMember(m.id, m.user.name)}
                        title="Remover membro"
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${role.cls}`}>
                      <role.icon className="h-3 w-3" />{role.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Tags — logo abaixo de membros, na coluna direita */}
      <SectionCard icon={TagsIcon} title="Tags" subtitle="Organize conversas e contatos com etiquetas coloridas">
        <TagsManager />
      </SectionCard>

      {/* Notificações — abaixo de tags, na coluna direita */}
      <SectionCard icon={Bell} title="Notificações" subtitle="Como e quando você quer ser avisado">
        <NotificationsManager />
      </SectionCard>
      </div>

      <InviteMemberDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={refreshMembers}
      />
      <MemberChannelsDrawer
        open={!!drawerMember}
        member={
          drawerMember
            ? { id: drawerMember.userId, name: drawerMember.user.name, role: drawerMember.role }
            : null
        }
        onClose={() => setDrawerMember(null)}
        onSaved={refreshMembers}
      />
    </div>
  );
}
