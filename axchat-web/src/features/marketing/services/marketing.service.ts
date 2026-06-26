import { api } from '@/lib/api';

export interface MarketingProfile {
  id: string;
  organizationId: string;
  companyDescription: string | null;
  products: string | null;
  targetAudience: string | null;
  toneOfVoice: string | null;
  guidelines: string | null;
  monthlyAdBudgetCents: number | null;
  maxDailyBudgetCents: number | null;
  currency: string;
  externalRulesSkill: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertMarketingProfileInput {
  companyDescription?: string;
  products?: string;
  targetAudience?: string;
  toneOfVoice?: string;
  guidelines?: string;
  monthlyAdBudgetCents?: number;
  maxDailyBudgetCents?: number;
  currency?: string;
  externalRulesSkill?: string;
}

export interface MarketingActivity {
  id: string;
  action: string;
  channel: string | null;
  status: string;
  title: string | null;
  createdAt: string;
}

export interface MarketingAnalysisRow {
  id: string;
  kind: string;
  title: string;
  summary: string;
  recommendations: string | null;
  createdAt: string;
}

export const marketingService = {
  async getProfile(): Promise<MarketingProfile | null> {
    const { data } = await api.get('/marketing/profile');
    return data?.data ?? data ?? null;
  },

  async upsertProfile(input: UpsertMarketingProfileInput): Promise<MarketingProfile> {
    const { data } = await api.put('/marketing/profile', input);
    return data?.data ?? data;
  },

  async activity(): Promise<{ activities: MarketingActivity[]; analyses: MarketingAnalysisRow[] }> {
    const { data } = await api.get('/marketing/activity');
    return data?.data ?? data;
  },
};
