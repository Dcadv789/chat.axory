import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

interface InstagramConfig {
  accessToken: string;
  igBusinessId?: string;
  appSecret?: string;
  apiVersion?: string;
  /**
   * Qual API da Meta usar:
   *   - 'facebook'  → graph.facebook.com + ID da conta IG no lugar de `/me`.
   *                   É o mesmo host e token (System User) que os agentes de
   *                   marketing usam (skills IG). UM token pra tudo. DEFAULT.
   *   - 'instagram' → graph.instagram.com + `/me`. Exige um Instagram Login
   *                   token (IGAA...), diferente do System User. Legado.
   */
  graphApi: 'facebook' | 'instagram';
}

@Injectable()
export class InstagramHttpClient {
  private readonly logger = new Logger(InstagramHttpClient.name);

  private getConfig(channel: Channel): InstagramConfig {
    const config = channel.config as Record<string, any>;
    // trim(): tokens colados costumam vir com espaço/quebra de linha no fim —
    // a Meta rejeita com #190 "Cannot parse access token". Limpa por garantia.
    const accessToken = String(
      config.accessToken || config.pageAccessToken || '',
    ).trim();
    const igBusinessId = config.igBusinessId || config.igUserId;
    return {
      accessToken,
      igBusinessId: igBusinessId ? String(igBusinessId).trim() : undefined,
      appSecret: config.appSecret,
      apiVersion: config.apiVersion || 'v25.0',
      graphApi: config.graphApi === 'instagram' ? 'instagram' : 'facebook',
    };
  }

  /** Host da Graph API conforme o modo. */
  private host(cfg: InstagramConfig): string {
    return cfg.graphApi === 'instagram'
      ? 'graph.instagram.com'
      : 'graph.facebook.com';
  }

  /**
   * Referência à própria conta nos endpoints. No modo instagram é `me`; no
   * modo facebook é o ID da conta IG (não existe `/me` útil com token de
   * System User em graph.facebook.com).
   */
  private selfRef(cfg: InstagramConfig): string {
    if (cfg.graphApi === 'instagram') return 'me';
    return cfg.igBusinessId ?? 'me';
  }

  private createClient(channel: Channel): AxiosInstance {
    const cfg = this.getConfig(channel);
    return axios.create({
      baseURL: `https://${this.host(cfg)}/${cfg.apiVersion}`,
      params: { access_token: cfg.accessToken },
      timeout: 30000,
    });
  }

  /**
   * Inscreve nosso app pra RECEBER webhooks (DMs + comentários). Sem isso a
   * Meta só entrega o payload de "Teste" manual do painel — mensagens reais
   * nunca chegam. Idempotente.
   *
   * No fluxo graph.facebook.com (Instagram via Facebook Login), a inscrição é
   * feita na PÁGINA do Facebook vinculada (config.fbPageId) — `subscribed_apps`
   * na conta IG retorna #3 (não suportado nesse node). Exige token com escopo
   * pages_manage_metadata + instagram_manage_messages. Lança o erro da Meta.
   */
  async subscribeApp(channel: Channel): Promise<any> {
    const cfg = this.getConfig(channel);
    const config = channel.config as Record<string, any>;
    const pageId = config?.fbPageId ? String(config.fbPageId).trim() : undefined;
    const client = this.createClient(channel);

    // Modo instagram (graph.instagram.com + token IGAA): inscreve a própria
    // conta IG. Modo facebook (default): inscreve a PÁGINA.
    if (cfg.graphApi === 'instagram') {
      if (!cfg.igBusinessId) {
        throw new Error('Instagram Business ID ausente pra inscrever o app.');
      }
      try {
        const { data } = await client.post(
          `/${cfg.igBusinessId}/subscribed_apps`,
          null,
          { params: { subscribed_fields: 'messages,comments' } },
        );
        return { ok: true, node: 'ig', ...data };
      } catch (err: any) {
        throw this.wrapGraphError(err, 'subscribeApp');
      }
    }

    if (!pageId) {
      throw new Error(
        'Facebook Page ID ausente. Preencha o campo "Facebook Page ID" do canal (é o FB_PAGE_ID das Variáveis) — sem ele a Meta não entrega as DMs.',
      );
    }

    // A inscrição da Página exige um PAGE access token (#210 com o token de
    // System User). Busca o token da Página primeiro — o System User precisa
    // ter a Página atribuída no Business Manager + escopo pages_show_list /
    // pages_read_engagement pra esse GET funcionar.
    let pageToken: string | undefined;
    try {
      const { data } = await client.get(`/${pageId}`, {
        params: { fields: 'access_token' },
      });
      pageToken = data?.access_token;
    } catch (err: any) {
      throw this.wrapGraphError(err, 'subscribeApp:getPageToken');
    }
    if (!pageToken) {
      throw new Error(
        'Não consegui obter o token da Página. Confirme que a Página está atribuída ao System User no Business Manager e que o token tem os escopos pages_show_list e pages_read_engagement.',
      );
    }

    try {
      const { data } = await axios.post(
        `https://${this.host(cfg)}/${cfg.apiVersion}/${pageId}/subscribed_apps`,
        null,
        {
          params: {
            // Só campos de MENSAGEM válidos pra Página. Comentários do IG são
            // assinados no nível do app (objeto Instagram) no painel de Webhooks.
            subscribed_fields:
              'messages,messaging_postbacks,message_reactions,message_reads',
            access_token: pageToken,
          },
          timeout: 30000,
        },
      );
      return { ok: true, node: 'page', ...data };
    } catch (err: any) {
      throw this.wrapGraphError(err, 'subscribeApp');
    }
  }

  async getMe(channel: Channel): Promise<any> {
    const cfg = this.getConfig(channel);
    const client = this.createClient(channel);
    // Campos válidos diferem por API: graph.instagram.com expõe user_id/
    // account_type; graph.facebook.com (conta IG) expõe id/username/name.
    const fields =
      cfg.graphApi === 'instagram'
        ? 'id,user_id,username,account_type,name'
        : 'id,username,name';
    try {
      const { data } = await client.get(`/${this.selfRef(cfg)}`, {
        params: { fields },
      });
      return data;
    } catch (err: any) {
      throw this.wrapGraphError(err, 'getMe');
    }
  }

  async resolveBusinessId(channel: Channel): Promise<string | null> {
    const cfg = this.getConfig(channel);
    if (cfg.igBusinessId) return cfg.igBusinessId;
    try {
      const info = await this.getMe(channel);
      return info?.user_id ?? info?.id ?? null;
    } catch {
      return null;
    }
  }

  async sendMessage(
    channel: Channel,
    payload: Record<string, any>,
  ): Promise<any> {
    const cfg = this.getConfig(channel);
    const client = this.createClient(channel);
    try {
      // facebook: POST /{ig-business-id}/messages — mesmo path que a skill
      // sendInstagramDirectMessage dos agentes (comprovadamente funciona).
      const { data } = await client.post(`/${this.selfRef(cfg)}/messages`, payload);
      return data;
    } catch (err: any) {
      throw this.wrapGraphError(err, 'sendMessage');
    }
  }

  async listConversations(
    channel: Channel,
    cursor?: string,
    limit = 50,
  ): Promise<{ data: any[]; nextCursor?: string }> {
    const cfg = this.getConfig(channel);
    const client = this.createClient(channel);
    const params: Record<string, any> = {
      platform: 'instagram',
      fields: 'id,updated_time,participants',
      limit,
    };
    if (cursor) params.after = cursor;

    try {
      const { data } = await client.get(`/${this.selfRef(cfg)}/conversations`, {
        params,
      });
      return {
        data: data?.data ?? [],
        nextCursor: data?.paging?.cursors?.after && data?.paging?.next ? data.paging.cursors.after : undefined,
      };
    } catch (err: any) {
      throw this.wrapGraphError(err, 'listConversations');
    }
  }

  async listConversationMessages(
    channel: Channel,
    conversationId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ data: any[]; nextCursor?: string }> {
    const client = this.createClient(channel);
    const params: Record<string, any> = {
      fields: 'id,created_time,from,to,message,attachments,shares,story,reactions',
      limit,
    };
    if (cursor) params.after = cursor;

    try {
      const { data } = await client.get(`/${conversationId}/messages`, { params });
      return {
        data: data?.data ?? [],
        nextCursor: data?.paging?.cursors?.after && data?.paging?.next ? data.paging.cursors.after : undefined,
      };
    } catch (err: any) {
      throw this.wrapGraphError(err, 'listConversationMessages');
    }
  }

  /**
   * Resolves a contact's profile (username + avatar). Combines:
   *   - `/{self}/conversations?user_id=...&fields=participants` — reliable for
   *     username/name.
   *   - `GET /{igsid}?fields=name,username,profile_pic` — best-effort for the
   *     avatar. May return `IGApiException code=230 "User consent is required"`
   *     depending on the user — we swallow it and return what we got.
   */
  async getUserProfile(channel: Channel, igUserId: string): Promise<any> {
    const cfg = this.getConfig(channel);
    const businessId = await this.resolveBusinessId(channel);
    const client = this.createClient(channel);

    let username: string | undefined;
    let name: string | undefined;
    let profile_pic: string | undefined;

    try {
      const { data } = await client.get(`/${this.selfRef(cfg)}/conversations`, {
        params: {
          platform: 'instagram',
          user_id: igUserId,
          fields: 'participants',
        },
      });
      const participants: any[] = data?.data?.[0]?.participants?.data || [];
      const contact = participants.find(
        (p) => p?.id && String(p.id) !== String(businessId),
      );
      if (contact) {
        username = contact.username;
        name = contact.name;
      }
    } catch (err: any) {
      this.logger.warn(
        `Instagram getUserProfile via conversations failed for ${igUserId}: ${err.message}`,
      );
    }

    try {
      const { data } = await client.get(`/${igUserId}`, {
        params: { fields: 'name,username,profile_pic' },
      });
      username = username || data?.username;
      name = name || data?.name;
      profile_pic = data?.profile_pic || profile_pic;
    } catch (err: any) {
      // IG frequently refuses this for non-consenting users — don't throw if we
      // already have a username/name.
      const metaCode = err?.response?.data?.error?.code;
      if (!username && !name) {
        if (metaCode === undefined) {
          this.logger.warn(
            `Instagram getUserProfile direct failed for ${igUserId}: ${err.message}`,
          );
        }
      }
    }

    if (!username && !name && !profile_pic) return null;
    return { username, name, profile_pic };
  }

  async getMessageDetail(channel: Channel, messageId: string): Promise<any> {
    const client = this.createClient(channel);
    try {
      const { data } = await client.get(`/${messageId}`, {
        params: { fields: 'id,created_time,from,to,message,attachments,shares,story' },
      });
      return data;
    } catch (err: any) {
      throw this.wrapGraphError(err, 'getMessageDetail');
    }
  }

  async downloadMedia(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    return Buffer.from(response.data);
  }

  /**
   * Tenta deletar/unsend uma DM no Instagram via Graph API.
   * Meta NÃO documenta esse endpoint pra Direct Messages e, na prática,
   * a maioria das apps recebe `(#10) Application does not have permission`
   * ou similar. Mantemos a tentativa pra cobrir o raro caso de tokens
   * com permissões especiais; o adapter captura o erro pra fazer fallback.
   */
  async deleteMessage(
    channel: Channel,
    messageId: string,
  ): Promise<void> {
    const client = this.createClient(channel);
    try {
      await client.delete(`/${messageId}`);
    } catch (err: any) {
      throw this.wrapGraphError(err, 'deleteMessage');
    }
  }

  /**
   * Facebook Login for Business: troca o `code` devolvido pelo popup por um
   * access token de usuário (business-scoped, longa duração). Usa as credenciais
   * do NOSSO app (configuradas pelo Super Admin em PlatformSetting). O App Secret
   * nunca trafega pelo frontend.
   */
  async exchangeCodeForToken(
    code: string,
    appId: string,
    appSecret: string,
    apiVersion = 'v25.0',
  ): Promise<string> {
    if (!appId || !appSecret) {
      throw new Error(
        'App Meta não configurado — defina App ID e App Secret em Super Admin > Integrações.',
      );
    }
    try {
      const { data } = await axios.get(
        `https://graph.facebook.com/${apiVersion}/oauth/access_token`,
        {
          params: { client_id: appId, client_secret: appSecret, code },
          timeout: 30000,
        },
      );
      if (!data?.access_token) {
        throw new Error('Meta não retornou access_token na troca do código');
      }
      return data.access_token as string;
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message;
      this.logger.error(`Instagram FLB token exchange failed: ${msg}`);
      throw new Error(`Falha ao trocar código por token: ${msg}`);
    }
  }

  /**
   * Lista as Páginas do Facebook que o usuário concedeu no popup, cada uma com
   * a conta profissional do Instagram vinculada (id + username) e o token da
   * própria Página. É o que o onboarding usa pra montar o canal sozinho: precisa
   * do Page access token (pra falar com a Graph em nome da conta) e do IG
   * business id. Requer os escopos pages_show_list + instagram_basic no token.
   */
  async listManagedPagesWithInstagram(
    userToken: string,
    apiVersion = 'v25.0',
  ): Promise<
    Array<{
      pageId: string;
      pageName: string | null;
      pageAccessToken: string;
      igBusinessId?: string;
      igUsername?: string;
    }>
  > {
    try {
      const { data } = await axios.get(
        `https://graph.facebook.com/${apiVersion}/me/accounts`,
        {
          params: {
            fields: 'id,name,access_token,instagram_business_account{id,username}',
            limit: 100,
            access_token: userToken,
          },
          timeout: 30000,
        },
      );
      const rows: any[] = Array.isArray(data?.data) ? data.data : [];
      return rows.map((p) => ({
        pageId: String(p.id),
        pageName: p.name ?? null,
        pageAccessToken: p.access_token,
        igBusinessId: p.instagram_business_account?.id
          ? String(p.instagram_business_account.id)
          : undefined,
        igUsername: p.instagram_business_account?.username,
      }));
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message;
      this.logger.error(`Instagram FLB list pages failed: ${msg}`);
      throw new Error(`Falha ao listar Páginas/contas do Instagram: ${msg}`);
    }
  }

  private wrapGraphError(err: any, context: string): Error {
    const metaError = err?.response?.data?.error;
    if (metaError) {
      const code = metaError.code !== undefined ? `[#${metaError.code}] ` : '';
      const subcode = metaError.error_subcode ? ` (subcode ${metaError.error_subcode})` : '';
      const msg = metaError.message || 'Unknown Meta error';
      this.logger.error(`Instagram ${context} failed: ${code}${msg}${subcode}`);
      return new Error(`Meta Graph API: ${code}${msg}${subcode}`);
    }
    this.logger.error(`Instagram ${context} failed: ${err.message}`);
    return err;
  }
}
