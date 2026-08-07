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
  /** null = sem limite: a sincronização traz o perfil inteiro. */
  postsSyncLimit: number | null;
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
  postsSyncLimit?: number | null;
}

/**
 * De onde saiu o valor exibido no mês:
 * - `explicit`  → verba definida naquele mês
 * - `inherited` → herdada do mês definido mais recente antes dele
 * - `legacy`    → veio do campo antigo de verba única do perfil
 * - `none`      → não há verba nenhuma configurada
 */
export type MarketingBudgetOrigin = 'explicit' | 'inherited' | 'legacy' | 'none';

export interface MarketingBudgetMonth {
  year: number;
  /** 1..12 */
  month: number;
  amountCents: number | null;
  origin: MarketingBudgetOrigin;
  inheritedFrom: { year: number; month: number } | null;
  note: string | null;
}

export interface MarketingBudgetYear {
  year: number;
  currency: string;
  legacyAmountCents: number | null;
  months: MarketingBudgetMonth[];
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

  // ─── Verba de mídia mês a mês ───
  /** Os 12 meses do ano com a origem de cada valor (definido / herdado / legado). */
  async listBudgets(year: number): Promise<MarketingBudgetYear> {
    const { data } = await api.get(`/marketing/budgets/${year}`);
    return data?.data ?? data;
  },

  /** Define a verba própria de um mês. Devolve o ano inteiro já atualizado. */
  async setBudget(
    year: number,
    month: number,
    amountCents: number,
    note?: string,
  ): Promise<MarketingBudgetYear> {
    const { data } = await api.put(`/marketing/budgets/${year}/${month}`, { amountCents, note });
    return data?.data ?? data;
  },

  /** Remove a verba própria do mês — ele volta a herdar. Devolve o ano atualizado. */
  async clearBudget(year: number, month: number): Promise<MarketingBudgetYear> {
    const { data } = await api.delete(`/marketing/budgets/${year}/${month}`);
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

  async mediaMetrics(since?: string, until?: string, all?: boolean): Promise<{
    window: string;
    since: string;
    metrics: MediaMetricRow[];
  }> {
    const params = all ? { all: 1 } : since && until ? { since, until } : undefined;
    const { data } = await api.get('/marketing/media-metrics', { params });
    return data?.data ?? data;
  },

  async adMetrics(since?: string, until?: string, all?: boolean): Promise<{
    window: string;
    since: string;
    metrics: AdMetricRow[];
  }> {
    const params = all ? { all: 1 } : since && until ? { since, until } : undefined;
    const { data } = await api.get('/marketing/ad-metrics', { params });
    return data?.data ?? data;
  },

  /**
   * `channelId` diz de QUAL conta de Instagram o painel está falando. Antes as
   * credenciais eram uma só por empresa e a última conexão sobrescrevia as
   * outras — conectar um segundo perfil roubava o marketing do primeiro, em
   * silêncio. Omitir mantém o comportamento antigo (credenciais da empresa).
   */
  async listAccounts(): Promise<{ accounts: MarketingAccount[] }> {
    const { data } = await api.get('/marketing/accounts');
    return data?.data ?? data;
  },

  /**
   * Conta padrão da empresa. É a que os agentes de IA usam: o contexto de
   * execução deles não carrega canal, então sem uma padrão eles agiriam sobre
   * a última conta conectada.
   */
  async setDefaultAccount(channelId: string | null): Promise<void> {
    await api.post('/marketing/accounts/default', { channelId });
  },

  async overview(
    since?: string,
    until?: string,
    all?: boolean,
    channelId?: string,
  ): Promise<MarketingOverview> {
    const base = all ? { all: 1 } : since && until ? { since, until } : {};
    const { data } = await api.get('/marketing/overview', {
      params: { ...base, ...(channelId ? { channelId } : {}) },
    });
    return data?.data ?? data;
  },

  // ─── Gestão de anúncios (Meta Ads ao vivo) ───
  async listCampaigns(channelId?: string): Promise<{ campaigns: AdCampaign[] }> {
    const { data } = await api.get('/marketing/ads/campaigns', {
      params: channelId ? { channelId } : undefined,
    });
    return data?.data ?? data;
  },

  async setCampaignStatus(
    id: string,
    status: 'ACTIVE' | 'PAUSED',
    channelId?: string,
  ): Promise<void> {
    await api.post(`/marketing/ads/campaigns/${id}/status`, { status, channelId });
  },

  async deleteCampaign(id: string, channelId?: string): Promise<void> {
    await api.delete(`/marketing/ads/campaigns/${id}`, {
      params: channelId ? { channelId } : undefined,
    });
  },

  async listAdSets(id: string, channelId?: string): Promise<{ adsets: AdSet[] }> {
    const { data } = await api.get(`/marketing/ads/campaigns/${id}/adsets`, {
      params: channelId ? { channelId } : undefined,
    });
    return data?.data ?? data;
  },

  async setCampaignBudget(
    id: string,
    dailyBudgetCents: number,
    channelId?: string,
  ): Promise<void> {
    await api.post(`/marketing/ads/campaigns/${id}/budget`, {
      dailyBudgetCents,
      channelId,
    });
  },

  // ─── Agendamento ───
  async listarAgendamentos(
    since: string,
    until: string,
  ): Promise<{ posts: ScheduledPost[] }> {
    const { data } = await api.get('/marketing/schedule', {
      params: { since, until },
    });
    return data?.data ?? data;
  },

  async agendarPost(payload: AgendarPostPayload): Promise<ScheduledPost> {
    const { data } = await api.post('/marketing/schedule', payload);
    return data?.data ?? data;
  },

  async reagendarPost(id: string, scheduledFor: string): Promise<ScheduledPost> {
    const { data } = await api.put(`/marketing/schedule/${id}`, { scheduledFor });
    return data?.data ?? data;
  },

  async cancelarAgendamento(id: string): Promise<void> {
    await api.post(`/marketing/schedule/${id}/cancel`);
  },

  async removerAgendamento(id: string): Promise<void> {
    await api.delete(`/marketing/schedule/${id}`);
  },

  async instagramProfile(channelId?: string): Promise<InstagramProfile> {
    const { data } = await api.get('/marketing/instagram/profile', {
      params: channelId ? { channelId } : undefined,
    });
    return data?.data ?? data;
  },

  async instagramPosts(
    channelId?: string,
  ): Promise<{ posts: InstagramPost[]; syncedAt?: string | null; total?: number }> {
    const { data } = await api.get('/marketing/instagram/posts', {
      params: channelId ? { channelId } : undefined,
    });
    return data?.data ?? data;
  },

  async deleteInstagramPost(mediaId: string, channelId?: string): Promise<void> {
    await api.delete(`/marketing/instagram/posts/${mediaId}`, {
      params: channelId ? { channelId } : undefined,
    });
  },

  // ─── Comentários ───
  async instagramComments(
    mediaId: string,
    channelId?: string,
  ): Promise<{ comments: InstagramComment[] }> {
    const { data } = await api.get('/marketing/instagram/comments', {
      params: { mediaId, ...(channelId ? { channelId } : {}) },
    });
    return data?.data ?? data;
  },

  async replyInstagramComment(
    commentId: string,
    message: string,
    channelId?: string,
  ): Promise<{ ok: true; replyId: string }> {
    const { data } = await api.post(
      `/marketing/instagram/comments/${commentId}/reply`,
      { message, channelId },
    );
    return data?.data ?? data;
  },

  /**
   * Ao ocultar, manda junto a cópia do comentário: a Meta para de devolvê-lo
   * na listagem, e é essa cópia que mantém ele visível (esmaecido) na tela.
   */
  async hideInstagramComment(
    commentId: string,
    hide: boolean,
    channelId?: string,
    snapshot?: {
      mediaId?: string;
      text?: string | null;
      username?: string | null;
      timestamp?: string | null;
      likes?: number | null;
    },
  ): Promise<void> {
    await api.post(`/marketing/instagram/comments/${commentId}/hide`, {
      hide,
      channelId,
      ...snapshot,
    });
  },

  async deleteInstagramComment(
    commentId: string,
    channelId?: string,
  ): Promise<void> {
    await api.delete(`/marketing/instagram/comments/${commentId}`, {
      params: channelId ? { channelId } : undefined,
    });
  },

  /**
   * Sobe a mídia pro nosso MinIO e devolve a URL pública. A Meta baixa a
   * imagem por essa URL na hora de publicar, então ela precisa ser acessível
   * sem autenticação — quem garante isso é o bucket, no backend.
   */
  async uploadPostMedia(
    file: File,
  ): Promise<{ url: string; urlOriginal: string; tipo: 'imagem' | 'video' }> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/marketing/uploads/post-media', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data?.data ?? data;
  },

  // ─── Publicação ───
  async publishInstagram(input: {
    caption?: string;
    imageUrl?: string;
    videoUrl?: string;
    /** 2 a 10 URLs — publica como carrossel, na ordem informada. */
    carouselUrls?: string[];
    channelId?: string;
  }): Promise<{ mediaId: string }> {
    const { data } = await api.post('/marketing/instagram/publish', input);
    return data?.data ?? data;
  },

  async publishThreads(input: { text?: string; imageUrl?: string; videoUrl?: string }): Promise<{ postId: string }> {
    const { data } = await api.post('/marketing/threads/publish', input);
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

export type ScheduledPostNetwork = 'INSTAGRAM' | 'THREADS';
export type ScheduledPostStatus =
  | 'PENDING'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELED';

export interface ScheduledPost {
  id: string;
  network: ScheduledPostNetwork;
  caption: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  carouselUrls: string[];
  /** ISO em UTC — a tela converte pro fuso de quem está olhando. */
  scheduledFor: string;
  status: ScheduledPostStatus;
  publishedAt: string | null;
  publishedMediaId: string | null;
  lastError: string | null;
  attempts: number;
  channelId: string | null;
  createdAt: string;
}

export interface AgendarPostPayload {
  network: ScheduledPostNetwork;
  /** ISO COM fuso. Sem ele o post sai na hora errada. */
  scheduledFor: string;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  carouselUrls?: string[];
  channelId?: string;
}

/** Ficha da conta, direto do nó da conta na Graph API. */
export interface InstagramProfile {
  id: string;
  username: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  biography: string | null;
  website: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
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

export interface InstagramCommentReply {
  id: string;
  text: string | null;
  username: string | null;
  timestamp: string | null;
  hidden: boolean;
}

export interface InstagramComment {
  id: string;
  text: string | null;
  username: string | null;
  timestamp: string | null;
  likes: number | null;
  hidden: boolean;
  /** Respostas já publicadas — é onde a resposta da automação aparece. */
  replies: InstagramCommentReply[];
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

export interface MarketingAccount {
  channelId: string;
  name: string;
  igUsername?: string;
  igUserId?: string;
  /** Sem conta de anúncios vinculada, só publicação e métricas de post. */
  hasAds: boolean;
  /** A conta que os agentes de IA usam quando ninguém escolhe. */
  isDefault: boolean;
}

export interface MarketingOverview {
  month: string;
  monthLabel: string;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
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
  campaignRanking: { name: string; spend: number; conversions: number; cpa: number | null }[];
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
