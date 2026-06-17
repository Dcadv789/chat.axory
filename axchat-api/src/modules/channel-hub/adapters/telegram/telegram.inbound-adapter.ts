import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import { ChannelLocator, InboundChannelPort } from '../../ports/inbound-channel.port';
import { WebhookParseResult } from '../../ports/types';
import { TelegramMessageMapper } from './telegram.message-mapper';

@Injectable()
export class TelegramInboundAdapter implements InboundChannelPort {
  readonly channelType = ChannelType.TELEGRAM;
  private readonly logger = new Logger(TelegramInboundAdapter.name);

  constructor(private readonly mapper: TelegramMessageMapper) {}

  extractLocators(_payload: unknown, headers: Record<string, string>): ChannelLocator[] {
    const secret =
      headers['x-telegram-bot-api-secret-token'] ||
      headers['X-Telegram-Bot-Api-Secret-Token'];
    return secret ? [{ telegramSecretToken: String(secret) }] : [];
  }

  matchesChannel(channel: Channel, locator: ChannelLocator): boolean {
    const config = (channel.config ?? {}) as Record<string, any>;
    const expected = config.secretToken || channel.webhookSecret;
    return !!locator.telegramSecretToken && !!expected && locator.telegramSecretToken === String(expected);
  }

  validateWebhook(
    headers: Record<string, string>,
    _rawBody: Buffer,
    webhookSecret?: string,
    channel?: Channel,
  ): boolean {
    const provided =
      headers['x-telegram-bot-api-secret-token'] ||
      headers['X-Telegram-Bot-Api-Secret-Token'];
    const config = (channel?.config ?? {}) as Record<string, any>;
    const expected = config.secretToken || webhookSecret;
    return !!provided && !!expected && String(provided) === String(expected);
  }

  parseWebhook(payload: unknown): WebhookParseResult {
    const result: WebhookParseResult = {
      messages: [],
      statuses: [],
      errors: [],
    };

    try {
      const update = (payload ?? {}) as Record<string, any>;
      const message = this.mapper.normalizeUpdate(update);
      if (message) result.messages.push(message);
      const status = this.mapper.normalizeStatus(update);
      if (status) result.statuses.push(status);
    } catch (error: any) {
      this.logger.error(`Failed to parse Telegram webhook: ${error.message}`);
      result.errors.push({
        code: 'PARSE_ERROR',
        message: error.message,
        rawData: payload,
      });
    }

    return result;
  }
}
