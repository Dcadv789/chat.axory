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
  analysisWindow: string | null;
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
  analysisWindow?: string;
}

export interface MediaMetricRow {
  id: string;
  mediaId: string;
  mediaType: string | null;
  caption: string | null;
  permalink: string | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  totalInteractions: number | null;
  views: number | null;
  capturedAt: string;
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

  async attachCrewChannel(channelId: string, lockSender?: boolean): Promise<void> {
    await api.post('/marketing/crew-channels', { channelId, lockSender });
  },

  async detachCrewChannel(channelId: string): Promise<void> {
    await api.delete(`/marketing/crew-channels/${channelId}`);
  },

  /** Re-aplica as skills/agents da crew (idempotente) — pega correções nas skills. */
  async resyncCrew(): Promise<void> {
    await api.post('/marketing/resync');
  },

  /**
   * Reset dos dados de TESTE: apaga análises + atividades e arquiva as
   * conversas de cron (histórico poluído). Métricas são preservadas.
   */
  async resetTestData(): Promise<{
    analyses: number;
    activities: number;
    conversations: number;
  }> {
    const { data } = await api.post('/marketing/reset-test-data');
    return data?.data ?? data;
  },

  async mediaMetrics(days?: number): Promise<{
    window: string;
    since: string;
    metrics: MediaMetricRow[];
  }> {
    const { data } = await api.get('/marketing/media-metrics', { params: days ? { days } : undefined });
    return data?.data ?? data;
  },

  async adMetrics(days?: number): Promise<{
    window: string;
    since: string;
    metrics: AdMetricRow[];
  }> {
    const { data } = await api.get('/marketing/ad-metrics', { params: days ? { days } : undefined });
    return data?.data ?? data;
  },

  async overview(days?: number): Promise<MarketingOverview> {
    const { data } = await api.get('/marketing/overview', { params: days ? { days } : undefined });
    return data?.data ?? data;
  },

  // ─── Gestão de anúncios (Meta Ads ao vivo) ───
  async listCampaigns(): Promise<{ campaigns: AdCampaign[] }> {
    const { data } = await api.get('/marketing/ads/campaigns');
    return data?.data ?? data;
  },

  async setCampaignStatus(id: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
    await api.post(`/marketing/ads/campaigns/${id}/status`, { status });
  },

  async deleteCampaign(id: string): Promise<void> {
    await api.delete(`/marketing/ads/campaigns/${id}`);
  },

  async listAdSets(id: string): Promise<{ adsets: AdSet[] }> {
    const { data } = await api.get(`/marketing/ads/campaigns/${id}/adsets`);
    return data?.data ?? data;
  },

  async setCampaignBudget(id: string, dailyBudgetCents: number): Promise<void> {
    await api.post(`/marketing/ads/campaigns/${id}/budget`, { dailyBudgetCents });
  },

  async instagramPosts(): Promise<{ posts: InstagramPost[] }> {
    const { data } = await api.get('/marketing/instagram/posts');
    return data?.data ?? data;
  },
};

export interface AdSet {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  optimizationGoal: string | null;
}

export interface InstagramPost {
  id: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  likes: number | null;
  comments: number | null;
}

export interface AdCampaign {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
}

export interface MarketingOverview {
  month: string;
  daysInMonth: number;
  dayOfMonth: number;
  daysRemaining: number;
  currency: string;
  monthlyBudget: number | null;
  maxDailyBudget: number | null;
  spentMonth: number | null;
  campaignsTotal: number | null;
  campaignsActive: number | null;
  insights: {
    spend: number | null;
    impressions: number | null;
    reach: number | null;
    clicks: number | null;
    ctr: number | null;
    cpc: number | null;
    cpm: number | null;
    conversions: number | null;
  };
  pacing: {
    remaining?: number;
    dailyRunRate?: number;
    projectedMonthEnd?: number;
    suggestedDailyForRest?: number;
    pctBudgetUsed?: number;
    pctMonthElapsed?: number;
    status?: 'ACIMA_DO_TETO' | 'ABAIXO_DO_TETO' | 'NO_RITMO';
  };
  warning?: string;
}

export interface AdMetricRow {
  id: string;
  campaignId: string;
  campaignName: string | null;
  objective: string | null;
  status: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  conversions: number | null;
  currency: string | null;
  capturedAt: string;
}

export interface CrewChannel {
  id: string;
  name: string;
  type: string;
  isPrimary: boolean;
}
