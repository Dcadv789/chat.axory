import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import { verifyMetaSignature } from '../meta-signature';
import {
  InboundChannelPort,
  ChannelLocator,
} from '../../ports/inbound-channel.port';
import { WebhookParseResult, VerificationResponse } from '../../ports/types';
import { WhatsAppOfficialMessageMapper } from './whatsapp-official.message-mapper';

@Injectable()
export class WhatsAppOfficialInboundAdapter implements InboundChannelPort {
  readonly channelType = ChannelType.WHATSAPP_OFFICIAL;
  private readonly logger = new Logger(WhatsAppOfficialInboundAdapter.name);

  constructor(private readonly mapper: WhatsAppOfficialMessageMapper) {}

  extractLocators(payload: unknown): ChannelLocator[] {
    const body = (payload ?? {}) as Record<string, any>;
    const entries: any[] = body?.entry || [];
    const seen = new Set<string>();
    const locators: ChannelLocator[] = [];

    for (const entry of entries) {
      const businessAccountId: string | undefined = entry?.id
        ? String(entry.id)
        : undefined;
      const changes = entry?.changes || [];
      for (const change of changes) {
        const metadata = change?.value?.metadata || {};
        const phoneNumberId: string | undefined = metadata.phone_number_id
          ? String(metadata.phone_number_id)
          : undefined;
        const key = `${businessAccountId ?? '-'}:${phoneNumberId ?? '-'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const locator: ChannelLocator = {};
        if (phoneNumberId) locator.phoneNumberId = phoneNumberId;
        if (businessAccountId) locator.businessAccountId = businessAccountId;
        if (phoneNumberId || businessAccountId) locators.push(locator);
      }
    }

    return locators;
  }

  matchesChannel(channel: Channel, locator: ChannelLocator): boolean {
    const config = (channel.config ?? {}) as Record<string, any>;
    if (locator.phoneNumberId && config.phoneNumberId) {
      return String(config.phoneNumberId) === locator.phoneNumberId;
    }
    if (locator.businessAccountId && config.businessAccountId) {
      return String(config.businessAccountId) === locator.businessAccountId;
    }
    return false;
  }

  validateWebhook(
    headers: Record<string, string>,
    rawBody: Buffer,
    _webhookSecret?: string,
    channel?: Channel,
    platformSecrets?: string[],
  ): boolean {
    const appSecret = (channel?.config as Record<string, any> | undefined)
      ?.appSecret;
    const secrets = [appSecret, ...(platformSecrets ?? [])];
    if (!secrets.some((s) => !!s)) {
      this.logger.warn(
        `WA Official channel ${channel?.id} missing config.appSecret — rejecting webhook`,
      );
      return false;
    }

    return verifyMetaSignature(headers, rawBody, secrets);
  }

  /**
   * Dois números são o mesmo se um termina no outro. Cobre a diferença de
   * código de país / formatação entre `display_phone_number` e `from`, sem
   * casar dois números curtos por coincidência.
   */
  private mesmoNumero(a: string, b?: string): boolean {
    if (!a || !b) return false;
    const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
    if (menor.length < 8) return a === b;
    return maior.endsWith(menor);
  }

  parseWebhook(payload: unknown, channel?: Channel): WebhookParseResult {
    const result: WebhookParseResult = {
      messages: [],
      statuses: [],
      errors: [],
    };

    try {
      const body = payload as Record<string, any>;
      const entries = body?.entry || [];
      const rawExpected = (channel?.config as any)?.phoneNumberId;
      const expectedPhoneNumberId = rawExpected ? String(rawExpected) : undefined;

      for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          const value = change?.value;
          if (!value) continue;

          const metadataPhoneId = value.metadata?.phone_number_id
            ? String(value.metadata.phone_number_id)
            : undefined;
          // Strict scoping: drop events for a different phone_number_id
          if (
            expectedPhoneNumberId &&
            metadataPhoneId &&
            metadataPhoneId !== expectedPhoneNumberId
          ) {
            continue;
          }

          const contacts = value.contacts || [];
          const messages = value.messages || [];
          const statuses = value.statuses || [];

          for (const msg of messages) {
            const contact =
              contacts.find((c: any) => c.wa_id === msg.from) || {};
            const normalized = this.mapper.normalizeInbound(msg, contact);
            if (normalized) {
              result.messages.push(normalized);
            }
          }

          for (const status of statuses) {
            const normalized = this.mapper.normalizeStatus(status);
            if (normalized) {
              result.statuses.push(normalized);
            }
          }

          // Coexistência: o que o dono manda PELO CELULAR chega em
          // `smb_message_echoes`. Sem digerir isso, quem responde pelo aparelho
          // não aparece na conversa e o histórico fica pela metade.
          for (const echo of value.message_echoes || []) {
            const normalized = this.mapper.normalizeEcho(
              echo,
              contacts.find((c: any) => c.wa_id === echo.to),
            );
            if (normalized) result.messages.push(normalized);
          }

          // Conversas ANTERIORES à conexão, entregues em lotes pelo campo
          // `history`. Aqui não existe `to`: a direção sai de comparar `from`
          // com o número da própria empresa.
          const businessPhone = value.metadata?.display_phone_number
            ? String(value.metadata.display_phone_number).replace(/\D/g, '')
            : undefined;
          for (const bloco of value.history || []) {
            for (const thread of bloco?.threads || []) {
              const clienteId = thread?.id ? String(thread.id) : undefined;
              if (!clienteId) continue;
              for (const msg of thread?.messages || []) {
                const from = String(msg?.from ?? '').replace(/\D/g, '');
                // `display_phone_number` vem formatado ("+55 11 91234-5678") e
                // nem sempre com o mesmo código de país que o `from`. Igualdade
                // exata falharia e inverteria o histórico INTEIRO — o que a
                // empresa disse viraria fala do cliente. Comparar pelo final
                // resolve, com um piso de dígitos pra não casar por acaso.
                const daEmpresa = this.mesmoNumero(from, businessPhone);
                const normalized = daEmpresa
                  ? this.mapper.normalizeEcho({ ...msg, to: clienteId })
                  : this.mapper.normalizeInbound(msg, {});
                if (normalized) result.messages.push(normalized);
              }
            }
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to parse WA Official webhook: ${error.message}`);
      result.errors.push({
        code: 'PARSE_ERROR',
        message: error.message,
        rawData: payload,
      });
    }

    return result;
  }

  handleVerification(
    query: Record<string, string>,
    webhookSecret?: string,
    channel?: Channel,
  ): VerificationResponse {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const verifyToken =
      (channel?.config as Record<string, any> | undefined)?.verifyToken ||
      webhookSecret;

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      this.logger.log('Meta webhook verification successful');
      return { statusCode: 200, body: challenge };
    }

    this.logger.warn('Meta webhook verification failed');
    return { statusCode: 403, body: { error: 'Verification failed' } };
  }
}
