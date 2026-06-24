import { Injectable } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import {
  ChannelLocator,
  InboundChannelPort,
} from '../../ports/inbound-channel.port';
import { WebhookParseResult } from '../../ports/types';

/**
 * Canal interno: console de conversa com o orquestrador dentro do app.
 * Não recebe webhooks — as mensagens do operador entram pela própria UI
 * (MessagesService). Este inbound é um stub para satisfazer o registro do
 * adapter; nenhum webhook externo chega num canal interno.
 */
@Injectable()
export class InternalInboundAdapter implements InboundChannelPort {
  readonly channelType = ChannelType.INTERNAL;

  extractLocators(): ChannelLocator[] {
    return [];
  }

  matchesChannel(): boolean {
    return false;
  }

  validateWebhook(): boolean {
    return false;
  }

  parseWebhook(_payload: unknown, _channel?: Channel): WebhookParseResult {
    return { messages: [], statuses: [], errors: [] };
  }
}
