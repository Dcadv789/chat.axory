import { api } from '@/lib/api';

/** Termos comerciais negociados por org (override do template do plano). */
export interface BillingProfile {
  seats?: number;
  pricePerSeatCents?: number;
  suiteFlatCents?: number;
  aiConversations?: number;
  includesMarketing?: boolean;
  includesAssistant?: boolean;
  discountType?: 'NONE' | 'PERCENT' | 'FIXED';
  discountValue?: number;
  discountReason?: string;
  setupFeeCents?: number;
  notes?: string;
}

export type BillingStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXEMPT';

export interface CurrentOrganization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: string;
  status: string;
  billingStatus: BillingStatus;
  billingAmountCents: number | null;
  billingCurrency: string;
  billingCycle: string;
  billingProfile: BillingProfile | null;
  marketingEnabled: boolean;
  assistantEnabled: boolean;
  /** Motor de automações ligado pra esta empresa. */
  automationsEnabled: boolean;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  createdAt: string;
}

export const organizationService = {
  async getCurrent(): Promise<CurrentOrganization> {
    const { data } = await api.get('/organizations/current');
    return data.data ?? data;
  },

  async update(input: {
    name?: string;
    automationsEnabled?: boolean;
  }): Promise<CurrentOrganization> {
    const { data } = await api.patch('/organizations/current', input);
    return data.data ?? data;
  },
};
