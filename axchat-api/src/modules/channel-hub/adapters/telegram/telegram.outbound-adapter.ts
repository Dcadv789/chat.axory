import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import { OutboundChannelPort } from '../../ports/outbound-channel.port';
import { NormalizedOutboundMessage, RateLimitConfig, SendResult } from '../../ports/types';
import { TelegramHttpClient } from './telegram.http-client';
import { TelegramMessageMapper } from './telegram.message-mapper';

@Injectable()
export class TelegramOutboundAdapter implements OutboundChannelPort {
  readonly channelType = ChannelType.TELEGRAM;
  private readonly logger = new Logger(TelegramOutboundAdapter.name);

  constructor(
    private readonly mapper: TelegramMessageMapper,
    private readonly httpClient: TelegramHttpClient,
  ) {}

  async sendMessage(
    channel: Channel,
    contactExternalId: string,
    message: NormalizedOutboundMessage,
  ): Promise<SendResult> {
    const { method, payload } = this.mapper.denormalize(message, contactExternalId);
    const response = await this.httpClient.sendWithChannel(channel, method, payload);
    return {
      externalId: response?.message_id
        ? `${response.chat?.id ?? contactExternalId}:${response.message_id}`
        : '',
      providerResponse: response,
    };
  }

  async sendTypingIndicator(channel: Channel, contactExternalId: string): Promise<void> {
    try {
      await this.httpClient.sendWithChannel(channel, 'sendChatAction', {
        chat_id: contactExternalId,
        action: 'typing',
      });
    } catch (error: any) {
      this.logger.warn(`Telegram typing indicator failed: ${error.message}`);
    }
  }

  async getMediaUrl(channel: Channel, mediaId: string): Promise<string> {
    return this.httpClient.getFileUrl(channel, mediaId);
  }

  async downloadMedia(channel: Channel, mediaId: string): Promise<Buffer> {
    return this.httpClient.downloadFile(channel, mediaId);
  }

  async resolveInboundMediaUrl(
    channel: Channel,
    hint: { mediaId?: string },
  ): Promise<{ fileUrl: string; mimeType?: string }> {
    if (!hint.mediaId) throw new Error('Telegram mediaId is required');
    return { fileUrl: await this.httpClient.getFileUrl(channel, hint.mediaId) };
  }

  getRateLimits(): RateLimitConfig {
    return {
      maxPerSecond: 25,
      maxPerMinute: 1200,
      windowMs: 60000,
    };
  }
}
