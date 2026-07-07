import { api } from '@/lib/api';

export type ChannelType = 'WHATSAPP_OFFICIAL' | 'WHATSAPP_ZAPPFY' | 'INSTAGRAM' | 'TELEGRAM' | 'INTERNAL' | 'THREADS';

export type ChannelVisibility = 'ORG' | 'PRIVATE';

export interface WebhookDiagnosticsEvent {
  receivedAt: string;
  status: 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'UNROUTED';
  routed: boolean;
  entryIds: string[];
  kinds: string[];
  idMatches: boolean;
  errorMessage?: string;
}

export interface WebhookDiagnostics {
  configuredIds: string[];
  totalReceived: number;
  events: WebhookDiagnosticsEvent[];
}

export interface Channel {
  id: string;
  organizationId: string;
  type: ChannelType;
  name: string;
  config: Record<string, any>;
  webhookSecret: string | null;
  isActive: boolean;
  /** null = segue org.aiEnabled, true = força ON, false = força OFF nesse canal. */
  aiEnabled: boolean | null;
  defaultOrchestratorId: string | null;
  /**
   * ORG     = qualquer membro da org com permissão padrão enxerga (default).
   * PRIVATE = só membros com grant explícito enxergam, mesmo OWNER/ADMIN.
   */
  visibility: ChannelVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelPayload {
  type: ChannelType;
  name: string;
  config: Record<string, any>;
  webhookSecret?: string;
  visibility?: ChannelVisibility;
}

export interface CoexistenceChannelPayload {
  name: string;
  code: string;
  phoneNumberId: string;
  businessAccountId: string;
  visibility?: ChannelVisibility;
}

export interface CoexistenceConfig {
  appId: string;
  configId: string;
  /** Config do Embedded Signup padrão (cai no configId se não configurado). */
  embeddedConfigId?: string;
  /** App ID a usar no FB.init do Instagram (dedicado ou herdado do WhatsApp). */
  instagramAppId?: string;
  /** Config de Facebook Login for Business pro Instagram (IG + Páginas). */
  instagramConfigId?: string;
  enabled: boolean;
  /** true quando app + secret + instagramConfigId estão configurados. */
  instagramEnabled?: boolean;
  /** true quando o app do Threads (id + secret) está configurado. */
  threadsEnabled?: boolean;
}

export interface ThreadsCarouselItem {
  mediaType: 'IMAGE' | 'VIDEO';
  imageUrl?: string;
  videoUrl?: string;
  altText?: string;
}

export interface ThreadsPublishPayload {
  mediaType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  altText?: string;
  children?: ThreadsCarouselItem[];
}

export interface InstagramFacebookLoginPayload {
  name: string;
  code: string;
  visibility?: ChannelVisibility;
}

export interface UpdateChannelPayload {
  name?: string;
  config?: Record<string, any>;
  webhookSecret?: string;
  isActive?: boolean;
  aiEnabled?: boolean | null;
  defaultOrchestratorId?: string | null;
  visibility?: ChannelVisibility;
}

export interface TestConnectionResult {
  success: boolean;
  status?: string;
  error?: string;
  data?: any;
}

export type SyncStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type SyncMode = 'INITIAL' | 'MANUAL' | 'DELTA';

export interface ChannelSyncJob {
  id: string;
  channelId: string;
  status: SyncStatus;
  mode: SyncMode;
  lookbackDays: number;
  startedAt: string | null;
  finishedAt: string | null;
  conversationsTotal: number;
  conversationsImported: number;
  messagesImported: number;
  contactsImported: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export const channelsService = {
  async list(): Promise<Channel[]> {
    const { data } = await api.get<{ data: Channel[] }>('/channels');
    return data.data;
  },

  async getById(id: string): Promise<Channel> {
    const { data } = await api.get<{ data: Channel }>(`/channels/${id}`);
    return data.data;
  },

  async webhookDiagnostics(id: string): Promise<WebhookDiagnostics> {
    const { data } = await api.get<{ data: WebhookDiagnostics }>(
      `/channels/${id}/webhook-diagnostics`,
    );
    return data.data ?? (data as any);
  },

  async instagramSubscribe(
    id: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const { data } = await api.post(`/channels/${id}/instagram-subscribe`);
    return (data as any).data ?? data;
  },

  async create(payload: CreateChannelPayload): Promise<Channel> {
    const { data } = await api.post<{ data: Channel }>('/channels', payload);
    return data.data;
  },

  async createCoexistence(payload: CoexistenceChannelPayload): Promise<Channel> {
    const { data } = await api.post<{ data: Channel }>(
      '/channels/whatsapp/coexistence',
      payload,
    );
    return data.data;
  },

  async createEmbeddedSignup(payload: CoexistenceChannelPayload): Promise<Channel> {
    const { data } = await api.post<{ data: Channel }>(
      '/channels/whatsapp/embedded-signup',
      payload,
    );
    return data.data;
  },

  async getCoexistenceConfig(): Promise<CoexistenceConfig> {
    const { data } = await api.get<{ data: CoexistenceConfig }>(
      '/channels/integrations/coexistence',
    );
    return data.data;
  },

  async createInstagramFacebookLogin(
    payload: InstagramFacebookLoginPayload,
  ): Promise<Channel> {
    const { data } = await api.post<{ data: Channel }>(
      '/channels/instagram/facebook-login',
      payload,
    );
    return data.data;
  },

  /** URL de autorização do Threads (o navegador é redirecionado pra ela). */
  async getThreadsAuthUrl(
    name: string,
    visibility?: ChannelVisibility,
  ): Promise<{ url: string }> {
    const { data } = await api.get<{ data: { url: string } }>(
      '/channels/threads/oauth/url',
      { params: { name, ...(visibility ? { visibility } : {}) } },
    );
    return data.data;
  },

  async threadsPublish(
    channelId: string,
    payload: ThreadsPublishPayload,
  ): Promise<{ id: string }> {
    const { data } = await api.post<{ data: { id: string } }>(
      `/channels/${channelId}/threads/publish`,
      payload,
    );
    return data.data;
  },

  async update(id: string, payload: UpdateChannelPayload): Promise<Channel> {
    const { data } = await api.patch<{ data: Channel }>(`/channels/${id}`, payload);
    return data.data;
  },

  async remove(id: string, confirmName: string): Promise<void> {
    await api.delete(`/channels/${id}`, {
      params: { confirmName },
    });
  },

  async testConnection(id: string): Promise<TestConnectionResult> {
    const { data } = await api.post<{ data: TestConnectionResult }>(`/channels/${id}/test`);
    return data.data;
  },

  async startSync(id: string): Promise<{ success: boolean; jobId?: string; status?: SyncStatus }> {
    const { data } = await api.post<{ data: { success: boolean; jobId?: string; status?: SyncStatus } }>(`/channels/${id}/sync`);
    return data.data;
  },

  async getSyncStatus(id: string): Promise<ChannelSyncJob | null> {
    const { data } = await api.get<{ data: { job: ChannelSyncJob | null } }>(`/channels/${id}/sync/status`);
    return data.data.job;
  },

  async cancelSync(id: string): Promise<ChannelSyncJob | null> {
    const { data } = await api.post<{ data: { job: ChannelSyncJob | null } }>(`/channels/${id}/sync/cancel`);
    return data.data.job;
  },

  async getWhatsAppHealth(id: string): Promise<WhatsAppHealth> {
    const { data } = await api.get<{ data: WhatsAppHealth }>(`/channels/${id}/whatsapp-health`);
    return data.data;
  },

  // ─── WhatsApp Templates ──────────────────────────
  async listWhatsappTemplates(channelId: string): Promise<WhatsappTemplate[]> {
    const { data } = await api.get<{ data: { data: WhatsappTemplate[] } }>(`/channels/${channelId}/whatsapp-templates`);
    return data.data.data;
  },

  async syncWhatsappTemplates(channelId: string): Promise<{ synced: number; total: number }> {
    const { data } = await api.post<{ data: { data: { synced: number; total: number } } }>(`/channels/${channelId}/whatsapp-templates/sync`);
    return data.data.data;
  },
};

export interface WhatsappTemplate {
  id: string;
  channelId: string;
  metaTemplateId: string;
  name: string;
  category: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  components: any[];
  syncedAt: string;
}

export interface WhatsAppHealth {
  phoneNumber: string | null;
  phoneName: string | null;
  businessName: string | null;
  businessNameStatus: 'ACCEPTED' | 'REJECTED' | 'PENDING' | null;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | null;
  accountMode: 'LIVE' | 'DEVELOPMENT' | null;
  codeVerificationStatus: 'VERIFIED' | 'NOT_VERIFIED' | null;
  webhookConfigured: boolean;
  webhookValid: boolean;
  lastFetched: string;
}
