import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

const THREADS_AUTH = 'https://threads.net';
const THREADS_GRAPH = 'https://graph.threads.net';
const API_VERSION = 'v1.0';

/** Escopos do Threads que pedimos no consentimento. */
export const THREADS_SCOPES = [
  'threads_basic',
  'threads_content_publish',
  'threads_manage_replies',
  'threads_read_replies',
  'threads_manage_insights',
].join(',');

interface ThreadsConfig {
  accessToken: string;
  threadsUserId: string;
  apiVersion: string;
}

export type ThreadsMediaType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';

export interface ThreadsCarouselItem {
  mediaType: 'IMAGE' | 'VIDEO';
  imageUrl?: string;
  videoUrl?: string;
  altText?: string;
}

export interface ThreadsPublishInput {
  mediaType: ThreadsMediaType;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  altText?: string;
  children?: ThreadsCarouselItem[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente da Threads API (graph.threads.net). Cobre o ciclo de vida do token
 * (OAuth code→curto→longo + refresh), publicação em 2 passos (cria container →
 * publica), respostas (ler/responder/ocultar) e insights (post + perfil).
 * Threads é canal de PUBLICAÇÃO — não há inbound de conversa como no WhatsApp/IG.
 */
@Injectable()
export class ThreadsHttpClient {
  private readonly logger = new Logger(ThreadsHttpClient.name);

  private getConfig(channel: Channel): ThreadsConfig {
    const config = channel.config as Record<string, any>;
    return {
      accessToken: String(config.accessToken || '').trim(),
      threadsUserId: String(config.threadsUserId || config.userId || '').trim(),
      apiVersion: config.apiVersion || API_VERSION,
    };
  }

  private createClient(channel: Channel): AxiosInstance {
    const cfg = this.getConfig(channel);
    return axios.create({
      baseURL: `${THREADS_GRAPH}/${cfg.apiVersion}`,
      params: { access_token: cfg.accessToken },
      timeout: 30000,
    });
  }

  // ─── OAuth ───────────────────────────────────────────

  /** Monta a URL da janela de autorização do Threads. */
  buildAuthorizeUrl(
    appId: string,
    redirectUri: string,
    state: string,
    scope: string = THREADS_SCOPES,
  ): string {
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      state,
    });
    return `${THREADS_AUTH}/oauth/authorize?${params.toString()}`;
  }

  /** Troca o `code` do callback por um token de CURTA duração (1h) + user_id. */
  async exchangeCodeForShortToken(
    code: string,
    redirectUri: string,
    appId: string,
    appSecret: string,
  ): Promise<{ accessToken: string; userId: string }> {
    try {
      const form = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      });
      const { data } = await axios.post(
        `${THREADS_GRAPH}/oauth/access_token`,
        form.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 30000,
        },
      );
      if (!data?.access_token || !data?.user_id) {
        throw new Error('Threads não retornou access_token/user_id');
      }
      return { accessToken: String(data.access_token), userId: String(data.user_id) };
    } catch (err: any) {
      throw this.wrapError(err, 'exchangeCodeForShortToken');
    }
  }

  /** Troca o token curto por um de LONGA duração (60 dias). */
  async exchangeForLongLivedToken(
    shortToken: string,
    appSecret: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const { data } = await axios.get(`${THREADS_GRAPH}/access_token`, {
        params: {
          grant_type: 'th_exchange_token',
          client_secret: appSecret,
          access_token: shortToken,
        },
        timeout: 30000,
      });
      if (!data?.access_token) throw new Error('Threads não retornou o token longo');
      return {
        accessToken: String(data.access_token),
        expiresIn: Number(data.expires_in) || 60 * 24 * 3600,
      };
    } catch (err: any) {
      throw this.wrapError(err, 'exchangeForLongLivedToken');
    }
  }

  /** Renova um token longo (rodar antes dos 60 dias — ~dia 50). */
  async refreshLongLivedToken(
    token: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const { data } = await axios.get(`${THREADS_GRAPH}/refresh_access_token`, {
        params: { grant_type: 'th_refresh_token', access_token: token },
        timeout: 30000,
      });
      if (!data?.access_token) throw new Error('Threads não renovou o token');
      return {
        accessToken: String(data.access_token),
        expiresIn: Number(data.expires_in) || 60 * 24 * 3600,
      };
    } catch (err: any) {
      throw this.wrapError(err, 'refreshLongLivedToken');
    }
  }

  /** Perfil da conta conectada (id, username, foto). */
  async getMe(
    token: string,
    apiVersion = API_VERSION,
  ): Promise<{ id: string; username?: string; name?: string; pictureUrl?: string }> {
    try {
      const { data } = await axios.get(`${THREADS_GRAPH}/${apiVersion}/me`, {
        params: {
          fields: 'id,username,name,threads_profile_picture_url',
          access_token: token,
        },
        timeout: 20000,
      });
      return {
        id: String(data?.id),
        username: data?.username,
        name: data?.name,
        pictureUrl: data?.threads_profile_picture_url,
      };
    } catch (err: any) {
      throw this.wrapError(err, 'getMe');
    }
  }

  // ─── Publicação (2 passos: cria container → publica) ─────────

  async publish(channel: Channel, input: ThreadsPublishInput): Promise<{ id: string }> {
    const cfg = this.getConfig(channel);
    if (!cfg.threadsUserId) throw new Error('threadsUserId ausente no canal.');

    let creationId: string;
    if (input.mediaType === 'CAROUSEL') {
      const items = input.children ?? [];
      if (items.length < 2 || items.length > 20) {
        throw new Error('Carrossel precisa de 2 a 20 itens.');
      }
      const childIds: string[] = [];
      for (const item of items) {
        const id = await this.createContainer(cfg, {
          media_type: item.mediaType,
          is_carousel_item: true,
          ...(item.imageUrl ? { image_url: item.imageUrl } : {}),
          ...(item.videoUrl ? { video_url: item.videoUrl } : {}),
          ...(item.altText ? { alt_text: item.altText } : {}),
        });
        await this.waitContainerReady(cfg, id);
        childIds.push(id);
      }
      creationId = await this.createContainer(cfg, {
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        ...(input.text ? { text: input.text } : {}),
      });
    } else {
      creationId = await this.createContainer(cfg, {
        media_type: input.mediaType,
        ...(input.text ? { text: input.text } : {}),
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
        ...(input.videoUrl ? { video_url: input.videoUrl } : {}),
        ...(input.altText ? { alt_text: input.altText } : {}),
      });
    }

    await this.waitContainerReady(cfg, creationId);
    return this.publishContainer(cfg, creationId);
  }

  private async createContainer(
    cfg: ThreadsConfig,
    params: Record<string, any>,
  ): Promise<string> {
    try {
      const { data } = await axios.post(
        `${THREADS_GRAPH}/${cfg.apiVersion}/${cfg.threadsUserId}/threads`,
        null,
        { params: { ...params, access_token: cfg.accessToken }, timeout: 30000 },
      );
      if (!data?.id) throw new Error('Threads não retornou o id do container');
      return String(data.id);
    } catch (err: any) {
      throw this.wrapError(err, 'createContainer');
    }
  }

  /**
   * Aguarda o container ficar FINISHED antes de publicar. Vídeo/carrossel levam
   * alguns segundos pra processar; texto/imagem costumam ficar prontos na hora.
   * Poll com teto de segurança (~60s).
   */
  private async waitContainerReady(cfg: ThreadsConfig, creationId: string): Promise<void> {
    for (let i = 0; i < 20; i++) {
      try {
        const { data } = await axios.get(
          `${THREADS_GRAPH}/${cfg.apiVersion}/${creationId}`,
          {
            params: { fields: 'status,error_message', access_token: cfg.accessToken },
            timeout: 15000,
          },
        );
        const status = data?.status;
        if (status === 'FINISHED' || status === 'PUBLISHED') return;
        if (status === 'ERROR' || status === 'EXPIRED') {
          throw new Error(`Container ${status}: ${data?.error_message ?? 'sem detalhe'}`);
        }
      } catch (err: any) {
        // Erro de leitura de status não deve travar — tenta publicar mesmo assim
        // no fim do loop. Só relança se for ERROR/EXPIRED explícito.
        if (/Container (ERROR|EXPIRED)/.test(err?.message ?? '')) throw err;
      }
      await sleep(3000);
    }
  }

  private async publishContainer(
    cfg: ThreadsConfig,
    creationId: string,
  ): Promise<{ id: string }> {
    try {
      const { data } = await axios.post(
        `${THREADS_GRAPH}/${cfg.apiVersion}/${cfg.threadsUserId}/threads_publish`,
        null,
        {
          params: { creation_id: creationId, access_token: cfg.accessToken },
          timeout: 30000,
        },
      );
      if (!data?.id) throw new Error('Threads não retornou o id do post publicado');
      return { id: String(data.id) };
    } catch (err: any) {
      throw this.wrapError(err, 'publishContainer');
    }
  }

  // ─── Respostas ───────────────────────────────────────

  /** Respostas de um post (1º nível). */
  async listReplies(channel: Channel, mediaId: string): Promise<any[]> {
    const client = this.createClient(channel);
    try {
      const { data } = await client.get(`/${mediaId}/replies`, {
        params: {
          fields:
            'id,text,username,permalink,timestamp,has_replies,hide_status,reply_audience',
          reverse: false,
        },
      });
      return data?.data ?? [];
    } catch (err: any) {
      throw this.wrapError(err, 'listReplies');
    }
  }

  /** Conversa completa (todas as respostas aninhadas) de um post. */
  async getConversation(channel: Channel, mediaId: string): Promise<any[]> {
    const client = this.createClient(channel);
    try {
      const { data } = await client.get(`/${mediaId}/conversation`, {
        params: {
          fields: 'id,text,username,permalink,timestamp,hide_status,replied_to',
        },
      });
      return data?.data ?? [];
    } catch (err: any) {
      throw this.wrapError(err, 'getConversation');
    }
  }

  /** Responde um post/resposta (cria container de reply e publica). */
  async reply(channel: Channel, replyToId: string, text: string): Promise<{ id: string }> {
    const cfg = this.getConfig(channel);
    if (!cfg.threadsUserId) throw new Error('threadsUserId ausente no canal.');
    const creationId = await this.createContainer(cfg, {
      media_type: 'TEXT',
      text,
      reply_to_id: replyToId,
    });
    await this.waitContainerReady(cfg, creationId);
    return this.publishContainer(cfg, creationId);
  }

  /** Oculta/reexibe uma resposta (moderação). */
  async hideReply(channel: Channel, replyId: string, hide: boolean): Promise<any> {
    const cfg = this.getConfig(channel);
    try {
      const { data } = await axios.post(
        `${THREADS_GRAPH}/${cfg.apiVersion}/${replyId}/manage_reply`,
        null,
        { params: { hide, access_token: cfg.accessToken }, timeout: 30000 },
      );
      return data;
    } catch (err: any) {
      throw this.wrapError(err, 'hideReply');
    }
  }

  // ─── Insights ────────────────────────────────────────

  /** Métricas de um post específico. */
  async getMediaInsights(channel: Channel, mediaId: string): Promise<any[]> {
    const client = this.createClient(channel);
    try {
      const { data } = await client.get(`/${mediaId}/insights`, {
        params: { metric: 'views,likes,replies,reposts,quotes,shares' },
      });
      return data?.data ?? [];
    } catch (err: any) {
      throw this.wrapError(err, 'getMediaInsights');
    }
  }

  /** Métricas do PERFIL (views, likes, replies, followers, etc.). */
  async getUserInsights(channel: Channel): Promise<any[]> {
    const cfg = this.getConfig(channel);
    const client = this.createClient(channel);
    try {
      const { data } = await client.get(`/${cfg.threadsUserId}/threads_insights`, {
        params: {
          metric: 'views,likes,replies,reposts,quotes,followers_count',
        },
      });
      return data?.data ?? [];
    } catch (err: any) {
      throw this.wrapError(err, 'getUserInsights');
    }
  }

  private wrapError(err: any, context: string): Error {
    const metaError = err?.response?.data?.error;
    if (metaError) {
      const code = metaError.code !== undefined ? `[#${metaError.code}] ` : '';
      const msg = metaError.message || 'Unknown Threads error';
      this.logger.error(`Threads ${context} failed: ${code}${msg}`);
      return new Error(`Threads API: ${code}${msg}`);
    }
    this.logger.error(`Threads ${context} failed: ${err.message}`);
    return err instanceof Error ? err : new Error(String(err));
  }
}
