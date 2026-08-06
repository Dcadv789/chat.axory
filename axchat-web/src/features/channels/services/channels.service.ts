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
  /** Estado atual da inscrição na Meta (só Instagram). */
  subscription?: {
    active: boolean;
    fields: string[];
    node: string;
    error?: string;
  };
  /** O token do canal ainda fala com a Meta (só Instagram). */
  token?: { valid: boolean; error?: string };
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
  /**
   * true quando o app do **Login do Instagram** (id + secret) está configurado.
   * Fluxo em que o dono entra com a conta do próprio Instagram, sem Página do FB.
   */
  instagramLoginEnabled?: boolean;
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

export interface InstagramTokenScopes {
  scopes: string[];
  permissoes: Array<{ escopo: string; para: string; concedida: boolean }>;
  faltando: string[];
}

export interface ThreadsPost {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  is_quote_post?: boolean;
}

export interface ThreadsReply {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  has_replies?: boolean;
  /** `HIDDEN` quando já foi ocultada pela moderação. */
  hide_status?: string;
}

export interface ThreadsInsight {
  name: string;
  title?: string;
  description?: string;
  values?: Array<{ value: number }>;
  total_value?: { value: number };
}

export interface InstagramFacebookLoginPayload {
  name: string;
  code: string;
  visibility?: ChannelVisibility;
}

/**
 * Canal recém-conectado + o que mais o login trouxe junto. Hoje só anúncios:
 * `connected: false` significa que as mensagens funcionam, mas a configuração
 * de Login do Facebook não concedeu permissão de anúncios.
 */
export type ChannelWithIntegrations = Channel & {
  integrations?: {
    ads:
      | { connected: true; adAccountId?: string }
      | { connected: false; reason: string };
  };
};

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

  /**
   * O que o token do canal REALMENTE consegue fazer, direto do debug_token.
   * Permissão "ativa" no painel da Meta não significa nada se o token não a
   * carrega — ele guarda os escopos do momento do login.
   */
  async instagramTokenScopes(id: string): Promise<InstagramTokenScopes> {
    const { data } = await api.get<{ data: InstagramTokenScopes }>(
      `/channels/${id}/instagram/token-scopes`,
    );
    return data.data ?? (data as any);
  },

  async webhookDiagnostics(id: string): Promise<WebhookDiagnostics> {
    const { data } = await api.get<{ data: WebhookDiagnostics }>(
      `/channels/${id}/webhook-diagnostics`,
    );
    return data.data ?? (data as any);
  },

  /** Refaz o login da Meta e grava as credenciais novas no canal existente. */
  async reconnectInstagram(id: string, code: string): Promise<Channel> {
    const { data } = await api.post<{ data: Channel }>(
      `/channels/${id}/instagram/reconnect`,
      { code },
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

  /**
   * Além do canal, devolve `integrations.ads` dizendo se a conta de anúncios
   * entrou junto. Sem a permissão de anúncios na configuração de Login do
   * Facebook, o canal conecta só com mensagens — e a tela precisa avisar.
   */
  async createInstagramFacebookLogin(
    payload: InstagramFacebookLoginPayload,
  ): Promise<ChannelWithIntegrations> {
    const { data } = await api.post<{ data: ChannelWithIntegrations }>(
      '/channels/instagram/facebook-login',
      payload,
    );
    return data.data;
  },

  /** DEBUG: retorna os dados brutos da Meta pro code (sem criar canal). */
  async debugInstagramFacebookLogin(
    payload: { code: string },
  ): Promise<Record<string, unknown>> {
    const { data } = await api.post<{ data: Record<string, unknown> }>(
      '/channels/instagram/facebook-login/debug',
      { name: 'debug', ...payload },
    );
    return data.data ?? (data as any);
  },

  /**
   * URL de autorização do **Login do Instagram** (o navegador é redirecionado
   * pra ela). Não exige Página do Facebook — o dono entra direto com a conta
   * do Instagram. O retorno cai no callback público do backend.
   */
  async getInstagramLoginAuthUrl(params: {
    name: string;
    visibility?: ChannelVisibility;
  }): Promise<{ url: string }> {
    const { data } = await api.get<{ data: { url: string } }>(
      '/channels/instagram-login/oauth/url',
      {
        params: {
          name: params.name,
          ...(params.visibility ? { visibility: params.visibility } : {}),
        },
      },
    );
    return data.data ?? (data as any);
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

  async threadsPosts(channelId: string): Promise<{ posts: ThreadsPost[] }> {
    const { data } = await api.get<{ data: { posts: ThreadsPost[] } }>(
      `/channels/${channelId}/threads/posts`,
    );
    return data.data;
  },

  async threadsReplies(
    channelId: string,
    mediaId: string,
  ): Promise<{ replies: ThreadsReply[] }> {
    const { data } = await api.get<{ data: { replies: ThreadsReply[] } }>(
      `/channels/${channelId}/threads/replies`,
      { params: { mediaId } },
    );
    return data.data;
  },

  async threadsReply(
    channelId: string,
    replyToId: string,
    text: string,
  ): Promise<{ id: string }> {
    const { data } = await api.post<{ data: { id: string } }>(
      `/channels/${channelId}/threads/reply`,
      { replyToId, text },
    );
    return data.data;
  },

  async threadsHideReply(
    channelId: string,
    replyId: string,
    hide: boolean,
  ): Promise<unknown> {
    const { data } = await api.post(
      `/channels/${channelId}/threads/hide-reply`,
      { replyId, hide },
    );
    return data;
  },

  /** Sem `mediaId` devolve os insights do perfil inteiro. */
  async threadsInsights(
    channelId: string,
    mediaId?: string,
  ): Promise<{ insights: ThreadsInsight[] }> {
    const { data } = await api.get<{ data: { insights: ThreadsInsight[] } }>(
      `/channels/${channelId}/threads/insights`,
      { params: mediaId ? { mediaId } : {} },
    );
    return data.data;
  },

  /** Responde publicamente um comentário do Instagram (`commentId` vem do webhook). */
  async instagramCommentReply(
    channelId: string,
    commentId: string,
    message: string,
  ): Promise<{ id: string }> {
    const { data } = await api.post<{ data: { id: string } }>(
      `/channels/${channelId}/instagram/comment-reply`,
      { commentId, message },
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
