import { api } from '@/lib/api';

export interface SuperAdminOverview {
  organizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  users: number;
  superAdmins: number;
  channels: number;
  activeChannels: number;
  agents: number;
  conversations: number;
  messages: number;
  plans: Array<{ plan: string; count: number }>;
  billing: Array<{ status: BillingStatus; count: number }>;
}

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type BillingStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXEMPT';

export interface SuperAdminOrganization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  status: OrganizationStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  billingStatus: BillingStatus;
  billingEmail: string | null;
  billingAmountCents: number | null;
  billingCurrency: string;
  billingCycle: string;
  billingDueDay: number | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  aiEnabled: boolean;
  aiMonthlyTokenCap: number | null;
  monthlyConversationLimit: number | null;
  createdAt: string;
  _count: {
    members: number;
    channels: number;
    conversations: number;
    aiAgents: number;
  };
  members: Array<{
    id: string;
    userId: string;
    role: string;
    joinedAt: string;
    user: { name: string; email: string; isActive: boolean };
  }>;
}

export interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  organizations: Array<{
    id: string;
    role: string;
    joinedAt: string;
    organization: { id: string; name: string; slug: string; plan: string; status?: string };
  }>;
}

export interface SuperAdminAuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
  organization: { id: string; name: string; slug: string } | null;
}

export interface SuperAdminPlanTemplate {
  plan: string;
  count: number;
  settings: {
    maxAgents: number;
    maxChannels: number;
    maxDepartments: number;
  };
}

export interface SuperAdminAgent {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  kind: string;
  category: string | null;
  capabilities: string[];
  modelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number | null;
  canRespondDirectly: boolean;
  parentAgentId: string | null;
  isActive: boolean;
  department: string | null;
  squad: string | null;
  operationalContext: string | null;
  operationalContextUpdatedAt: string | null;
  createdAt: string;
  organization: { id: string; name: string };
  channels: Array<{
    channel: { id: string; name: string; type: string };
    mode: string;
  }>;
  _count: { runs: number };
}

export const DEFAULT_PLAN_TEMPLATES: SuperAdminPlanTemplate[] = [
  { plan: 'free', count: 0, settings: { maxAgents: 2, maxChannels: 1, maxDepartments: 1 } },
  { plan: 'starter', count: 0, settings: { maxAgents: 5, maxChannels: 2, maxDepartments: 3 } },
  { plan: 'pro', count: 0, settings: { maxAgents: 25, maxChannels: 10, maxDepartments: 10 } },
  { plan: 'enterprise', count: 0, settings: { maxAgents: 999, maxChannels: 999, maxDepartments: 999 } },
];

function normalizePlanSettings(raw: unknown): SuperAdminPlanTemplate['settings'] {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    maxAgents: Number(obj.maxAgents ?? 0),
    maxChannels: Number(obj.maxChannels ?? 0),
    maxDepartments: Number(obj.maxDepartments ?? 0),
  };
}

function normalizePlanTemplate(raw: unknown): SuperAdminPlanTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const plan = String(item.plan ?? '');
  if (!plan) return null;
  return {
    plan,
    count: Number(item.count ?? 0),
    settings: normalizePlanSettings(item.settings),
  };
}

function mergePlanTemplates(
  templates: SuperAdminPlanTemplate[],
  counts?: Array<{ plan: string; count: number }>,
): SuperAdminPlanTemplate[] {
  const countMap = Object.fromEntries((counts ?? []).map((row) => [row.plan, row.count]));
  const byPlan = Object.fromEntries(templates.map((item) => [item.plan, item]));

  return DEFAULT_PLAN_TEMPLATES.map((fallback) => {
    const current = byPlan[fallback.plan];
    return {
      plan: fallback.plan,
      count: countMap[fallback.plan] ?? current?.count ?? 0,
      settings: current?.settings ?? fallback.settings,
    };
  });
}

export const superAdminService = {
  async overview() {
    const { data } = await api.get<{ data: SuperAdminOverview }>('/super-admin/overview');
    return data.data;
  },

  async organizations(search?: string) {
    const { data } = await api.get<{ data: SuperAdminOrganization[] }>('/super-admin/organizations', {
      params: search ? { search } : undefined,
    });
    return data.data;
  },

  async users(search?: string) {
    const { data } = await api.get<{ data: SuperAdminUser[] }>('/super-admin/users', {
      params: search ? { search } : undefined,
    });
    return data.data;
  },

  async createOrganization(payload: {
    organizationName: string;
    slug?: string;
    plan?: string;
    ownerName: string;
    ownerEmail: string;
    ownerPassword: string;
  }) {
    const { data } = await api.post('/super-admin/organizations', payload);
    return data.data;
  },

  async updateOrganizationPlan(
    id: string,
    payload: {
      plan?: string;
      settings?: Record<string, unknown>;
      aiEnabled?: boolean;
      aiMonthlyTokenCap?: number | null;
      monthlyConversationLimit?: number | null;
    },
  ) {
    const { data } = await api.patch(`/super-admin/organizations/${id}/plan`, payload);
    return data.data;
  },

  async planTemplates(planCounts?: Array<{ plan: string; count: number }>) {
    try {
      const { data } = await api.get<{ data: unknown }>('/super-admin/plans');
      const list = Array.isArray(data?.data) ? data.data : [];
      const normalized = list
        .map((item) => normalizePlanTemplate(item))
        .filter((item): item is SuperAdminPlanTemplate => item !== null);
      return mergePlanTemplates(
        normalized.length ? normalized : DEFAULT_PLAN_TEMPLATES,
        planCounts,
      );
    } catch {
      return mergePlanTemplates(DEFAULT_PLAN_TEMPLATES, planCounts);
    }
  },

  async updatePlanTemplate(
    plan: string,
    payload: {
      maxAgents: number;
      maxChannels: number;
      maxDepartments: number;
      applyToExisting?: boolean;
    },
  ) {
    const { data } = await api.patch(`/super-admin/plans/${plan}`, payload);
    return data.data as {
      plan: string;
      settings: SuperAdminPlanTemplate['settings'];
      updatedOrganizations: number;
    };
  },

  async updateBilling(
    id: string,
    payload: {
      billingStatus?: BillingStatus;
      billingEmail?: string | null;
      billingAmountCents?: number | null;
      billingCurrency?: string;
      billingCycle?: string;
      billingDueDay?: number | null;
      trialEndsAt?: string | null;
      currentPeriodEndsAt?: string | null;
    },
  ) {
    const { data } = await api.patch(`/super-admin/organizations/${id}/billing`, payload);
    return data.data;
  },

  async suspendOrganization(id: string, reason: string) {
    const { data } = await api.post(`/super-admin/organizations/${id}/suspend`, { reason });
    return data.data;
  },

  async unsuspendOrganization(id: string) {
    const { data } = await api.post(`/super-admin/organizations/${id}/unsuspend`);
    return data.data;
  },

  async addOrganizationMember(id: string, payload: { email: string; role: string }) {
    const { data } = await api.post(`/super-admin/organizations/${id}/members`, payload);
    return data.data;
  },

  async updateOrganizationMember(id: string, membershipId: string, payload: { role: string }) {
    const { data } = await api.patch(`/super-admin/organizations/${id}/members/${membershipId}`, payload);
    return data.data;
  },

  async removeOrganizationMember(id: string, membershipId: string) {
    const { data } = await api.post(`/super-admin/organizations/${id}/members/${membershipId}/remove`);
    return data.data;
  },

  async impersonate(id: string, userId: string) {
    const { data } = await api.post(`/super-admin/organizations/${id}/impersonate/${userId}`);
    return data.data as {
      accessToken: string;
      refreshToken: string;
      user: SuperAdminUser;
      organizations: Array<{ id: string; name: string; slug: string; role: string }>;
      impersonatedBy: string;
    };
  },

  async auditLogs(params?: { organizationId?: string; limit?: number }) {
    const { data } = await api.get<{ data: SuperAdminAuditLog[] }>('/super-admin/audit-logs', {
      params,
    });
    return data.data;
  },

  async createUser(payload: {
    name: string;
    email: string;
    password: string;
    isSuperAdmin?: boolean;
  }) {
    const { data } = await api.post('/super-admin/users', payload);
    return data.data;
  },

  async updateUserStatus(id: string, payload: { isActive?: boolean; isSuperAdmin?: boolean }) {
    const { data } = await api.patch(`/super-admin/users/${id}/status`, payload);
    return data.data;
  },

  async updateUser(
    id: string,
    payload: {
      name?: string;
      email?: string;
      password?: string;
      isActive?: boolean;
      isSuperAdmin?: boolean;
    },
  ) {
    const { data } = await api.patch(`/super-admin/users/${id}`, payload);
    return data.data as SuperAdminUser;
  },

  // ─── AI Agents ──────────────────────────────────────

  async listAllAgents(organizationId?: string) {
    const { data } = await api.get<{ data: SuperAdminAgent[] }>('/super-admin/agents', {
      params: organizationId ? { organizationId } : undefined,
    });
    return data.data;
  },

  async copyAgent(id: string, targetOrgId: string) {
    const { data } = await api.post(`/super-admin/agents/${id}/copy`, { targetOrgId });
    return data.data;
  },

  async copyAgentsBulk(sourceOrgId: string, targetOrgId: string) {
    const { data } = await api.post<{ data: { copied: number; sectorsCopied?: number; agents: Array<{ id: string; name: string }> } }>(
      '/super-admin/agents/copy-bulk',
      { sourceOrgId, targetOrgId },
    );
    return data.data;
  },

  async updateAgent(id: string, payload: Record<string, any>) {
    const { data } = await api.patch(`/super-admin/agents/${id}`, payload);
    return data.data;
  },

  async listOrgModels(organizationId: string) {
    const { data } = await api.get<{ data: AiModelProvider[] }>(
      `/super-admin/organizations/${organizationId}/ai-models`,
    );
    return data.data;
  },

  // ─── Global Departments ─────────────────────────────

  async listDepartments(): Promise<GlobalDepartment[]> {
    const { data } = await api.get<{ data: GlobalDepartment[] }>('/super-admin/departments');
    return data.data;
  },

  async createDepartment(name: string): Promise<GlobalDepartment> {
    const { data } = await api.post('/super-admin/departments', { name });
    return data.data ?? data;
  },

  async updateDepartment(id: string, name: string): Promise<GlobalDepartment> {
    const { data } = await api.patch(`/super-admin/departments/${id}`, { name });
    return data.data ?? data;
  },

  async removeDepartment(id: string): Promise<void> {
    await api.delete(`/super-admin/departments/${id}`);
  },

  // ─── Agent Sectors ────────────────────────────────

  async listOrgSectors(organizationId: string) {
    const { data } = await api.get(`/super-admin/organizations/${organizationId}/sectors`);
    return data.data ?? data;
  },

  async addAgentToSector(sectorId: string, agentId: string) {
    const { data } = await api.post(`/super-admin/sectors/${sectorId}/agents`, { agentId });
    return data.data ?? data;
  },

  async removeAgentFromSector(sectorId: string, agentId: string) {
    await api.delete(`/super-admin/sectors/${sectorId}/agents/${agentId}`);
  },
};

export interface GlobalDepartment {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface AiModelProvider {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  modelId: string;
  apiKey: string | null;
  baseUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
