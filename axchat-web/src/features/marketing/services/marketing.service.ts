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

  /** Cria/garante o canal interno de comando da crew e retorna ids p/ abrir. */
  async ensureCrewChannel(): Promise<{
    channelId: string;
    conversationId: string;
    viewId: string | null;
  } | null> {
    const { data } = await api.post('/marketing/crew-channel');
    return data?.data ?? data ?? null;
  },

  async listCrewChannels(): Promise<{
    channels: CrewChannel[];
    available: { id: string; name: string; type: string }[];
  }> {
    const { data } = await api.get('/marketing/crew-channels');
    return data?.data ?? data;
  },

  async attachCrewChannel(channelId: string): Promise<void> {
    await api.post('/marketing/crew-channels', { channelId });
  },

  async detachCrewChannel(channelId: string): Promise<void> {
    await api.delete(`/marketing/crew-channels/${channelId}`);
  },
};

export interface CrewChannel {
  id: string;
  name: string;
  type: string;
  isPrimary: boolean;
}
