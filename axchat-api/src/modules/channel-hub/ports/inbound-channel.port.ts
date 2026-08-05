import { Channel, ChannelType } from '@prisma/client';
import {
  WebhookParseResult,
  VerificationResponse,
} from './types';

/**
 * Locator extracted from a webhook payload that uniquely identifies
 * which provider account/instance the event belongs to.
 *
 * - WA Official: { phoneNumberId, businessAccountId? }
 * - Instagram:   { igBusinessId }
 * - Zappfy:      { instanceId?, token? }
 * - Telegram:    { telegramSecretToken }
 */
export interface ChannelLocator {
  phoneNumberId?: string;
  businessAccountId?: string;
  igBusinessId?: string;
  instanceId?: string;
  token?: string;
  telegramSecretToken?: string;
}

export interface InboundChannelPort {
  readonly channelType: ChannelType;

  /**
   * Extract channel locators from a raw webhook payload. Each returned locator
   * MUST correspond to a single Channel row (via matching `config.*` fields).
   * May return an empty array when the payload has no routable events.
   */
  extractLocators(payload: unknown, headers: Record<string, string>): ChannelLocator[];

  /**
   * Tests whether a given Channel matches a locator. Must be stateless.
   */
  matchesChannel(channel: Channel, locator: ChannelLocator): boolean;

  /**
   * `platformSecrets` traz os App Secrets ATUAIS do PlatformSetting. O canal
   * guarda uma cópia de quando foi conectado, que fica velha se o Super Admin
   * trocar a chave — sem estes candidatos, todo webhook passa a ser rejeitado.
   */
  validateWebhook(
    headers: Record<string, string>,
    rawBody: Buffer,
    webhookSecret?: string,
    channel?: Channel,
    platformSecrets?: string[],
  ): boolean;

  /**
   * Parse a webhook payload scoped to the resolved channel. Implementations
   * should only emit events that belong to `channel`.
   */
  parseWebhook(payload: unknown, channel?: Channel): WebhookParseResult;

  handleVerification?(
    query: Record<string, string>,
    webhookSecret?: string,
    channel?: Channel,
  ): VerificationResponse;
}

export const INBOUND_CHANNEL_PORT = 'INBOUND_CHANNEL_PORT';
