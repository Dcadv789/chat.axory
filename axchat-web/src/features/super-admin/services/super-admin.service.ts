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
export type DiscountType = 'NONE' | 'PERCENT' | 'FIXED';

/** Termos comerciais negociados por empresa (override do template) + desconto. */
export interface BillingProfile {
  seats?: number;
  pricePerSeatCents?: number;
  suiteFlatCents?: number;
  aiConversations?: number;
  includesMarketing?: boolean;
  includesAssistant?: boolean;
  setupFeeCents?: number;
  discountType?: DiscountType;
  discountValue?: number; // PERCENT: 0-100; FIXED: centavos
  discountReason?: string;
  notes?: string;
}

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
  billingProfile: BillingProfile | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  aiEnabled: boolean;
  marketingEnabled: boolean;
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

export interface PlanSettings {
  label: string;
  description: string;
  pricePerSeatCents: number;
  minSeats: number;
  suiteFlatCents: number;
  aiConversations: number;
  includesMarketing: boolean;
  includesAssistant: boolean;
  setupFeeCents: number;
  maxAgents: number;
  maxChannels: number;
  maxDepartments: number;
}

export interface SuperAdminPlanTemplate {
  plan: string;
  count: number;
  settings: PlanSettings;
}

export interface PricingMeta {
  trialDays: number;
  addons: { key: string; label: string; priceCents: number; note: string }[];
  aiPackages: { label: string; conversations: number; priceCents: number }[];
  notes: string;
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
  isCore: boolean;
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

function plan(
  p: string,
  label: string,
  description: string,
  s: Partial<PlanSettings>,
): SuperAdminPlanTemplate {
  return {
    plan: p,
    count: 0,
    settings: {
      label,
      description,
      pricePerSeatCents: 0,
      minSeats: 1,
      suiteFlatCents: 0,
      aiConversations: 0,
      includesMarketing: false,
      includesAssistant: false,
      setupFeeCents: 0,
      maxAgents: 0,
      maxChannels: 0,
      maxDepartments: 0,
      ...s,
    },
  };
}

export const DEFAULT_PLAN_TEMPLATES: SuperAdminPlanTemplate[] = [
  plan('inbox', 'Inbox', 'Caixa de entrada omnichannel + ferramentas. Sem IA.', {
    pricePerSeatCents: 7900, minSeats: 2, aiConversations: 0, setupFeeCents: 49700,
    maxAgents: 0, maxChannels: 5, maxDepartments: 3,
  }),
  plan('essencial', 'Essencial', 'Inbox + IA de atendimento (~1k conversas/mês).', {
    pricePerSeatCents: 9700, minSeats: 2, aiConversations: 1000, setupFeeCents: 79700,
    maxAgents: 5, maxChannels: 5, maxDepartments: 5,
  }),
  plan('profissional', 'Profissional', 'IA avançada, watchdog, automações (~3k). Add-ons disponíveis.', {
    pricePerSeatCents: 19700, minSeats: 3, aiConversations: 3000, setupFeeCents: 129700,
    maxAgents: 25, maxChannels: 15, maxDepartments: 15,
  }),
  plan('performance', 'Performance', 'Profissional + Suíte (Marketing + Assistente) inclusa (~8k).', {
    pricePerSeatCents: 19700, minSeats: 3, suiteFlatCents: 69700, aiConversations: 8000,
    includesMarketing: true, includesAssistant: true, setupFeeCents: 249700,
    maxAgents: 999, maxChannels: 999, maxDepartments: 999,
  }),
];

const FALLBACK_SETTINGS = DEFAULT_PLAN_TEMPLATES[0].settings;

function normalizePlanSettings(raw: unknown): PlanSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    label: typeof obj.label === 'string' ? obj.label : '',
    description: typeof obj.description === 'string' ? obj.description : '',
    pricePerSeatCents: num(obj.pricePerSeatCents),
    minSeats: num(obj.minSeats, 1),
    suiteFlatCents: num(obj.suiteFlatCents),
    aiConversations: num(obj.aiConversations),
    includesMarketing: !!obj.includesMarketing,
    includesAssistant: !!obj.includesAssistant,
    setupFeeCents: num(obj.setupFeeCents),
    maxAgents: num(obj.maxAgents),
    maxChannels: num(obj.maxChannels),
    maxDepartments: num(obj.maxDepartments),
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

  async cloneAgents(payload: {
    sourceOrgId: string;
    targetOrgId: string;
    sectors: string[];
    departments?: string[];
  }): Promise<{
    created: string[];
    skipped: string[];
    channelsLinked: number;
    toolsCreated: number;
    skillsCreated: number;
    skillsLinked: number;
  }> {
    const { data } = await api.post('/super-admin/clone-agents', payload);
    return data.data ?? data;
  },

  async updateOrganizationPlan(
    id: string,
    payload: {
      plan?: string;
      settings?: Record<string, unknown>;
      aiEnabled?: boolean;
      marketingEnabled?: boolean;
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
    payload: Partial<PlanSettings> & { applyToExisting?: boolean },
  ) {
    const { data } = await api.patch(`/super-admin/plans/${plan}`, payload);
    return data.data as {
      plan: string;
      settings: PlanSettings;
      updatedOrganizations: number;
    };
  },

  async pricingMeta(): Promise<PricingMeta> {
    const { data } = await api.get<{ data: PricingMeta }>('/super-admin/pricing-meta');
    return data.data;
  },

  async updatePricingMeta(payload: Partial<PricingMeta>): Promise<PricingMeta> {
    const { data } = await api.patch<{ data: PricingMeta }>('/super-admin/pricing-meta', payload);
    return data.data;
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
      billingProfile?: BillingProfile;
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

  // ─── Integrations: Meta Coexistence ─────────────────

  async getMetaCoexistence(): Promise<MetaCoexistenceConfig> {
    const { data } = await api.get<{ data: MetaCoexistenceConfig }>(
      '/super-admin/integrations/meta-coexistence',
    );
    return data.data;
  },

  async updateMetaCoexistence(payload: {
    appId?: string;
    appSecret?: string;
    configId?: string;
    embeddedConfigId?: string;
  }): Promise<MetaCoexistenceConfig> {
    const { data } = await api.patch<{ data: MetaCoexistenceConfig }>(
      '/super-admin/integrations/meta-coexistence',
      payload,
    );
    return data.data;
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

  // ─── Built-in Tools (referência) ──────────────────

  async listBuiltinTools() {
    const { data } = await api.get<{ data: BuiltinTool[] }>('/super-admin/builtin-tools');
    return data.data;
  },

  // ─── Skills Management ────────────────────────────

  async listAllSkills(organizationId?: string): Promise<SuperAdminSkill[]> {
    const { data } = await api.get<{ data: SuperAdminSkill[] }>('/super-admin/skills', {
      params: organizationId ? { organizationId } : undefined,
    });
    return data.data;
  },

  async copySkill(skillId: string, targetOrgId: string) {
    const { data } = await api.post(`/super-admin/skills/${skillId}/copy`, { targetOrgId });
    return data.data;
  },
};

export interface GlobalDepartment {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface MetaCoexistenceConfig {
  appId: string;
  configId: string;
  embeddedConfigId: string;
  hasSecret: boolean;
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

export interface BuiltinTool {
  name: string;
  description: string;
  kinds: string[];
  clientOps: boolean;
}

export interface SuperAdminSkill {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: string | null;
  promptInstructions: string | null;
  source: string;
  toolId: string | null;
  httpMethod: string | null;
  httpPath: string | null;
  sqlQuery: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organization: { id: string; name: string };
  tool: { id: string; name: string; source: string; sqlConnectionRef: string | null } | null;
  _count: { agents: number; versions: number };
}
