import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import { OutboundChannelPort } from '../../ports/outbound-channel.port';
import {
  NormalizedOutboundMessage,
  RateLimitConfig,
  SendResult,
} from '../../ports/types';
import { EvolutionHttpClient } from './evolution.http-client';
import { EvolutionMessageMapper, soONumero } from './evolution.message-mapper';

@Injectable()
export class EvolutionOutboundAdapter implements OutboundChannelPort {
  readonly channelType = ChannelType.WHATSAPP_EVOLUTION;
  private readonly logger = new Logger(EvolutionOutboundAdapter.name);

  constructor(
    private readonly mapper: EvolutionMessageMapper,
    private readonly http: EvolutionHttpClient,
  ) {}

  async sendMessage(
    channel: Channel,
    contactExternalId: string,
    message: NormalizedOutboundMessage,
  ): Promise<SendResult> {
    const { endpoint, payload } = this.mapper.desnormalizar(
      message,
      contactExternalId,
    );

    const resposta = await this.http.post(channel, endpoint, payload);

    return {
      // O eco do webhook traz `key.id`. Usar o mesmo campo dos dois lados é o
      // que faz o eco casar com a mensagem que já gravamos, em vez de
      // duplicar a linha na conversa.
      externalId: resposta?.key?.id ?? resposta?.messageId ?? '',
      providerResponse: resposta,
    };
  }

  async sendTypingIndicator(
    channel: Channel,
    contactExternalId: string,
  ): Promise<void> {
    try {
      await this.http.post(channel, '/chat/sendPresence', {
        number: soONumero(contactExternalId),
        presence: 'composing',
        delay: 1200,
      });
    } catch (err) {
      // "Digitando..." é enfeite. Derrubar o envio da mensagem de verdade por
      // causa disso seria trocar o essencial pelo cosmético.
      this.logger.debug(
        `Presence falhou no canal ${channel.id}: ${(err as Error).message}`,
      );
    }
  }

  async getMediaUrl(): Promise<string> {
    // A Evolution entrega a mídia embutida no próprio webhook (base64) ou por
    // URL já resolvida; não existe endpoint de "buscar mídia por id" como na
    // Meta. Quem chamar isto está no caminho errado.
    throw new Error(
      'WhatsApp não oficial não busca mídia por id — ela vem no próprio webhook.',
    );
  }

  async downloadMedia(): Promise<Buffer> {
    throw new Error(
      'WhatsApp não oficial não busca mídia por id — ela vem no próprio webhook.',
    );
  }

  /**
   * Apaga pra todo mundo, inclusive no aparelho do cliente. O WhatsApp só
   * permite isso dentro da janela dele; passado o prazo a Evolution recusa e
   * quem chamou cai no apagar-só-aqui.
   */
  async deleteMessage(
    channel: Channel,
    externalMessageId: string,
    contactExternalId?: string,
  ): Promise<void> {
    await this.http.post(channel, '/chat/deleteMessageForEveryone', {
      id: externalMessageId,
      remoteJid: contactExternalId
        ? `${soONumero(contactExternalId)}@s.whatsapp.net`
        : undefined,
      fromMe: true,
    });
  }

  /**
   * Número conservador de propósito. Aqui não existe cota publicada como na
   * API oficial: quem limita é o antispam do WhatsApp, e a punição não é erro
   * 429 — é o número do cliente ser banido. Melhor sair devagar.
   */
  getRateLimits(): RateLimitConfig {
    return { maxPerSecond: 1, maxPerMinute: 30, windowMs: 60_000 };
  }
}
