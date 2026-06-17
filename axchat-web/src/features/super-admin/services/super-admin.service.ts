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
    role: string;
    organization: { id: string; name: string; slug: string; plan: string };
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
};
