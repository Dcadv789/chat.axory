import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

interface TelegramConfig {
  botToken: string;
}

@Injectable()
export class TelegramHttpClient {
  private readonly logger = new Logger(TelegramHttpClient.name);

  private getConfig(channel: Channel): TelegramConfig {
    const config = (channel.config ?? {}) as Record<string, any>;
    if (!config.botToken) {
      throw new Error('Telegram channel missing config.botToken');
    }
    return { botToken: String(config.botToken) };
  }

  private createClient(channel: Channel): AxiosInstance {
    const cfg = this.getConfig(channel);
    return axios.create({
      baseURL: `https://api.telegram.org/bot${cfg.botToken}`,
      timeout: 30000,
    });
  }

  async getMe(channel: Channel): Promise<any> {
    const client = this.createClient(channel);
    try {
      const { data } = await client.get('/getMe');
      if (!data?.ok) throw new Error(data?.description || 'Telegram getMe failed');
      return data.result;
    } catch (err: any) {
      throw this.wrapTelegramError(err, 'getMe');
    }
  }

  async setWebhook(channel: Channel, webhookUrl: string, secretToken: string): Promise<any> {
    const client = this.createClient(channel);
    try {
      const { data } = await client.post('/setWebhook', {
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
      });
      if (!data?.ok) throw new Error(data?.description || 'Telegram setWebhook failed');
      return data.result;
    } catch (err: any) {
      throw this.wrapTelegramError(err, 'setWebhook');
    }
  }

  async send(method: string, payload: Record<string, any>): Promise<any> {
    const token = payload.__botToken;
    if (!token) throw new Error('Telegram send missing bot token');
    const { __botToken, ...body } = payload;
    const client = axios.create({
      baseURL: `https://api.telegram.org/bot${token}`,
      timeout: 30000,
    });

    try {
      const { data } = await client.post(`/${method}`, body);
      if (!data?.ok) throw new Error(data?.description || `Telegram ${method} failed`);
      return data.result;
    } catch (err: any) {
      throw this.wrapTelegramError(err, method);
    }
  }

  async sendWithChannel(channel: Channel, method: string, payload: Record<string, any>): Promise<any> {
    const cfg = this.getConfig(channel);
    return this.send(method, { ...payload, __botToken: cfg.botToken });
  }

  async getFileUrl(channel: Channel, fileId: string): Promise<string> {
    const cfg = this.getConfig(channel);
    const client = this.createClient(channel);
    try {
      const { data } = await client.get('/getFile', { params: { file_id: fileId } });
      if (!data?.ok || !data.result?.file_path) {
        throw new Error(data?.description || 'Telegram getFile failed');
      }
      return `https://api.telegram.org/file/bot${cfg.botToken}/${data.result.file_path}`;
    } catch (err: any) {
      throw this.wrapTelegramError(err, 'getFile');
    }
  }

  async downloadFile(channel: Channel, fileId: string): Promise<Buffer> {
    const fileUrl = await this.getFileUrl(channel, fileId);
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    return Buffer.from(response.data);
  }

  private wrapTelegramError(err: any, context: string): Error {
    const apiDescription = err?.response?.data?.description;
    const message = apiDescription || err?.message || 'Unknown Telegram error';
    this.logger.error(`Telegram ${context} failed: ${message}`);
    return new Error(`Telegram API: ${message}`);
  }
}
