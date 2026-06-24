import { Injectable } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import { OutboundChannelPort } from '../../ports/outbound-channel.port';
import {
  NormalizedOutboundMessage,
  RateLimitConfig,
  SendResult,
} from '../../ports/types';

/**
 * Canal interno: console de conversa com o orquestrador dentro do app.
 * Não há provider externo — as respostas do agente já são persistidas e
 * emitidas via Socket.io pelo próprio runner. Este outbound é um no-op que
 * só devolve um externalId sintético pra satisfazer o contrato do pipeline.
 */
@Injectable()
export class InternalOutboundAdapter implements OutboundChannelPort {
  readonly channelType = ChannelType.INTERNAL;

  async sendMessage(
    _channel: Channel,
    contactExternalId: string,
  ): Promise<SendResult> {
    return {
      externalId: `internal-${contactExternalId}-${Date.now()}`,
      providerResponse: { ok: true, internal: true },
    };
  }

  async sendTypingIndicator(): Promise<void> {
    // Sem provider externo — nada a fazer.
  }

  async getMediaUrl(_channel: Channel, mediaId: string): Promise<string> {
    return mediaId;
  }

  async downloadMedia(): Promise<Buffer> {
    throw new Error('Internal channel has no remote media to download');
  }

  getRateLimits(): RateLimitConfig {
    return { maxPerSecond: 50, maxPerMinute: 3000, windowMs: 60000 };
  }
}
