import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import FormDataLib = require('form-data');
import { whatsappMediaUploadMeta } from './whatsapp-media.util';

const FormData = (FormDataLib as any).default || FormDataLib;

interface WaOfficialConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  apiVersion?: string;
}

@Injectable()
export class WhatsAppOfficialHttpClient {
  private readonly logger = new Logger(WhatsAppOfficialHttpClient.name);

  private getConfig(channel: Channel): WaOfficialConfig {
    const config = channel.config as Record<string, any>;
    return {
      accessToken: config.accessToken,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      apiVersion: config.apiVersion || 'v21.0',
    };
  }

  private createClient(channel: Channel): AxiosInstance {
    const cfg = this.getConfig(channel);
    return axios.create({
      baseURL: `https://graph.facebook.com/${cfg.apiVersion}`,
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      timeout: 30000,
    });
  }

  async sendMessage(
    channel: Channel,
    payload: Record<string, any>,
  ): Promise<any> {
    const cfg = this.getConfig(channel);
    const client = this.createClient(channel);
    try {
      const { data } = await client.post(
        `/${cfg.phoneNumberId}/messages`,
        payload,
      );
      return data;
    } catch (error: any) {
      this.logger.error(
        `WA Official API error: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  async getMediaUrl(channel: Channel, mediaId: string): Promise<string> {
    const client = this.createClient(channel);
    const { data } = await client.get(`/${mediaId}`);
    return data.url;
  }

  async downloadMedia(channel: Channel, url: string): Promise<Buffer> {
    const cfg = this.getConfig(channel);
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    return Buffer.from(response.data);
  }

  /**
   * Uploads media bytes to Meta's servers and returns the media id.
   * Uses form-data (not fetch+Blob) — Node's fetch multipart is unreliable
   * and can upload empty bodies, which yields broken audio on the client.
   */
  async uploadMedia(
    channel: Channel,
    buffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    if (!buffer?.byteLength) {
      throw new Error('Cannot upload empty media buffer to WhatsApp');
    }

    const cfg = this.getConfig(channel);
    const { type, contentType } = whatsappMediaUploadMeta(mimeType, filename);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', type);
    form.append('file', buffer, {
      filename: filename || 'media.bin',
      contentType,
      knownLength: buffer.byteLength,
    });

    try {
      const { data } = await axios.post(
        `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/media`,
        form,
        {
          headers: {
            Authorization: `Bearer ${cfg.accessToken}`,
            ...form.getHeaders(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 120_000,
        },
      );

      if (!data?.id) {
        throw new Error('WhatsApp media upload returned no media id');
      }

      this.logger.log(
        `WA Official media uploaded: id=${data.id} type=${type} bytes=${buffer.byteLength}`,
      );
      return data.id;
    } catch (error: any) {
      const details =
        error.response?.data?.error?.error_data?.details ||
        error.response?.data?.error?.message ||
        error.message;
      this.logger.error(
        `WA Official media upload failed (${type}, ${buffer.byteLength}b): ${details}`,
      );
      throw new Error(`Failed to upload media to WhatsApp: ${details}`);
    }
  }

  async verifyPhoneNumber(channel: Channel): Promise<any> {
    const cfg = this.getConfig(channel);
    const client = this.createClient(channel);
    try {
      const { data } = await client.get(`/${cfg.phoneNumberId}`);
      return data;
    } catch (error: any) {
      this.logger.error(`WA Official verify failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Coexistência (Embedded Signup): troca o `code` devolvido pelo popup da
   * Meta por um access token de negócio. Usa as credenciais do NOSSO app
   * (configuradas pelo Super Admin em PlatformSetting). O App Secret nunca
   * trafega pelo frontend.
   */
  async exchangeCodeForToken(
    code: string,
    appId: string,
    appSecret: string,
    apiVersion = 'v21.0',
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
    } catch (error: any) {
      const msg = error.response?.data?.error?.message || error.message;
      this.logger.error(`WA coexistence token exchange failed: ${msg}`);
      throw new Error(`Falha ao trocar código por token: ${msg}`);
    }
  }

  /**
   * Busca os dados do número (telefone formatado + nome verificado) direto do
   * Facebook usando o token recém-trocado — pra preencher as credenciais do
   * canal sozinho no fluxo de Embedded Signup. Best-effort: falha vira {}.
   */
  async fetchPhoneNumberInfo(
    token: string,
    phoneNumberId: string,
    apiVersion = 'v21.0',
  ): Promise<{ displayPhoneNumber?: string; verifiedName?: string }> {
    try {
      const { data } = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`,
        {
          params: {
            fields: 'display_phone_number,verified_name',
            access_token: token,
          },
          timeout: 20000,
        },
      );
      return {
        displayPhoneNumber: data?.display_phone_number,
        verifiedName: data?.verified_name,
      };
    } catch (err: any) {
      this.logger.warn(
        `fetchPhoneNumberInfo falhou (${phoneNumberId}): ${err?.message ?? err}`,
      );
      return {};
    }
  }

  /**
   * Registra o número na Cloud API (obrigatório após o Embedded Signup pra o
   * número enviar/receber pela API). Usa o PIN de verificação em duas etapas.
   * "Já registrado" é esperado em reconexões — devolvemos alreadyRegistered
   * sem quebrar. Erro de PIN (2FA já ativa com outro PIN) volta em `error`.
   */
  async registerPhoneNumber(
    token: string,
    phoneNumberId: string,
    pin: string,
    apiVersion = 'v21.0',
  ): Promise<{ registered: boolean; alreadyRegistered: boolean; error?: string }> {
    try {
      await axios.post(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/register`,
        { messaging_product: 'whatsapp', pin },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 },
      );
      return { registered: true, alreadyRegistered: false };
    } catch (err: any) {
      const metaErr = err?.response?.data?.error;
      const code = metaErr?.code;
      const msg = metaErr?.message || err.message;
      // 133005/133006/133010/133015 e variações de "already registered" =
      // número já está na Cloud API. Reconexão — não é falha.
      const alreadyRegistered =
        [133005, 133006, 133010, 133015].includes(code) ||
        /already.*regist|is already|has already been/i.test(String(msg));
      if (alreadyRegistered) {
        this.logger.warn(
          `WA register: número ${phoneNumberId} já registrado (${msg}) — seguindo.`,
        );
        return { registered: false, alreadyRegistered: true, error: msg };
      }
      this.logger.error(`WA register falhou (${phoneNumberId}): ${msg}`);
      return { registered: false, alreadyRegistered: false, error: msg };
    }
  }

  /**
   * Subscribes our app to receive webhooks for this WABA. Idempotent on
   * Meta's side — re-calling is safe. Requires `whatsapp_business_management`
   * scope on the access token.
   */
  async subscribeApp(channel: Channel): Promise<any> {
    const cfg = this.getConfig(channel);
    if (!cfg.businessAccountId) {
      throw new Error('businessAccountId required to subscribe app');
    }
    const client = this.createClient(channel);
    const { data } = await client.post(`/${cfg.businessAccountId}/subscribed_apps`);
    return data;
  }
}
