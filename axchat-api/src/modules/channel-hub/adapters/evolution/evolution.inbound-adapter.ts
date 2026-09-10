import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelType } from '@prisma/client';
import * as crypto from 'crypto';
import {
  InboundChannelPort,
  ChannelLocator,
} from '../../ports/inbound-channel.port';
import { WebhookParseResult } from '../../ports/types';
import { EvolutionMessageMapper } from './evolution.message-mapper';
import { EvolutionConnectionService } from './evolution-connection.service';

@Injectable()
export class EvolutionInboundAdapter implements InboundChannelPort {
  readonly channelType = ChannelType.WHATSAPP_EVOLUTION;
  private readonly logger = new Logger(EvolutionInboundAdapter.name);

  constructor(
    private readonly mapper: EvolutionMessageMapper,
    private readonly conexao: EvolutionConnectionService,
  ) {}

  /**
   * A Evolution identifica a origem pelo nome da instância, que vem no corpo
   * de todo evento. Um nome = um canal, porque a instância é criada por nós
   * com o id do canal dentro.
   */
  extractLocators(payload: unknown): ChannelLocator[] {
    const evento = (payload ?? {}) as Record<string, any>;
    const instancia = evento.instance ?? evento.instanceName;
    if (!instancia) return [];
    return [{ instanceId: String(instancia) }];
  }

  matchesChannel(channel: Channel, locator: ChannelLocator): boolean {
    const config = (channel.config ?? {}) as Record<string, any>;
    if (!locator.instanceId || !config.instanceName) return false;
    return String(config.instanceName) === String(locator.instanceId);
  }

  /**
   * A Evolution NÃO assina o corpo — não há equivalente ao `x-hub-signature`
   * da Meta. O que temos é o header que nós mesmos mandamos configurar na
   * criação da instância, então a validação é comparar esse token com o
   * segredo do canal.
   *
   * Comparação em tempo constante: com `===`, o tempo de resposta vaza quantos
   * caracteres iniciais o atacante acertou, e o segredo é descobrível byte a
   * byte por quem consegue medir isso.
   */
  validateWebhook(
    headers: Record<string, string>,
    _rawBody: Buffer,
    webhookSecret?: string,
  ): boolean {
    if (!webhookSecret) {
      // Canal sem segredo é canal mal criado. Recusar é o certo: aceitar
      // significaria que qualquer um que descobrisse a URL injeta mensagem na
      // caixa de entrada de um cliente.
      this.logger.warn('Canal Evolution sem webhookSecret — webhook recusado.');
      return false;
    }

    const recebido =
      headers['x-webhook-token'] ??
      headers['X-Webhook-Token'] ??
      headers['apikey'];
    if (!recebido) return false;

    const a = Buffer.from(String(recebido));
    const b = Buffer.from(webhookSecret);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  parseWebhook(payload: unknown, channel?: Channel): WebhookParseResult {
    const evento = (payload ?? {}) as Record<string, any>;
    const tipo = String(evento.event ?? '').toLowerCase().replace(/_/g, '.');
    const vazio: WebhookParseResult = { messages: [], statuses: [], errors: [] };

    // Conexão caiu ou subiu. Não é mensagem, mas é a única fonte que nos conta
    // que o cliente despareou o celular — sem isso o canal fica "ativo" pra
    // sempre e as mensagens somem em silêncio.
    if (tipo === 'connection.update') {
      if (channel) {
        void this.conexao
          .aplicarEventoDeConexao(channel, evento)
          .catch((err) =>
            this.logger.warn(`Falha ao aplicar conexão: ${err.message}`),
          );
      }
      return vazio;
    }

    if (tipo === 'messages.update') {
      return { ...vazio, statuses: this.mapper.lerStatus(evento) };
    }

    if (tipo !== 'messages.upsert' && tipo !== 'send.message') {
      return vazio;
    }

    const mensagens = this.mapper
      .extrairMensagens(evento)
      .map((m) => this.mapper.normalizar(m))
      .filter(Boolean) as WebhookParseResult['messages'];

    return { ...vazio, messages: mensagens };
  }
}
