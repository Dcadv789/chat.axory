import { Injectable, Logger } from '@nestjs/common';
import { Channel, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { EvolutionState } from './evolution.http-client';
import { soONumero } from './evolution.message-mapper';

/** O que a tela mostra sobre o pareamento do celular. */
export type StatusDoCanal = 'CONECTADO' | 'CONECTANDO' | 'DESCONECTADO';

/**
 * Guarda no canal o estado do pareamento com o celular.
 *
 * Existe porque o WhatsApp não oficial cai sozinho: o cliente troca de
 * aparelho, desliga o celular por dias, ou remove o dispositivo pareado pelo
 * app. Sem registrar isso, o canal continua "ativo" na tela, a IA segue
 * tentando responder e as mensagens somem sem ninguém notar — o pior modo de
 * falha possível num inbox.
 */
@Injectable()
export class EvolutionConnectionService {
  private readonly logger = new Logger(EvolutionConnectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  static traduzir(state: EvolutionState): StatusDoCanal {
    if (state === 'open') return 'CONECTADO';
    if (state === 'connecting') return 'CONECTANDO';
    return 'DESCONECTADO';
  }

  /**
   * Persiste o estado. `numeroConectado` só chega quando a Evolution informa
   * qual telefone parou no outro lado do QR.
   *
   * NÃO mexe em `isActive` de propósito. `isActive` é a chave que o cliente
   * liga e desliga; o pareamento é outra coisa e mora em `config`. Amarrar os
   * dois cria um canal que não volta sozinho: o roteador de webhook só procura
   * entre canais ativos, então desativar ao cair faria o `CONNECTION_UPDATE`
   * de "reconectou" ser descartado — e o canal ficaria morto até alguém
   * reativar na mão, sem nenhuma pista do motivo.
   */
  async registrar(
    channelId: string,
    status: StatusDoCanal,
    numeroConectado?: string | null,
  ): Promise<void> {
    try {
      const canal = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { config: true },
      });
      if (!canal) return;

      const config = { ...((canal.config ?? {}) as Record<string, any>) };
      config.connectionStatus = status;
      config.connectionCheckedAt = new Date().toISOString();
      if (numeroConectado) config.connectedNumber = soONumero(numeroConectado);
      // O QR só vale enquanto ninguém escaneou. Guardá-lo depois de conectar
      // deixaria um código morto no banco que a tela poderia mostrar de novo.
      if (status === 'CONECTADO') delete config.lastQrCode;

      await this.prisma.channel.update({
        where: { id: channelId },
        data: { config: config as Prisma.InputJsonValue },
      });
    } catch (err) {
      this.logger.warn(
        `Não consegui gravar o estado do canal ${channelId}: ${(err as Error).message}`,
      );
    }
  }

  /** Lê o que a Evolution mandou no CONNECTION_UPDATE e persiste. */
  async aplicarEventoDeConexao(channel: Channel, payload: any): Promise<void> {
    const bruto = payload?.data?.state ?? payload?.data?.connection;
    if (!bruto) return;

    const s = String(bruto).toLowerCase();
    const status: StatusDoCanal =
      s === 'open' ? 'CONECTADO' : s === 'connecting' ? 'CONECTANDO' : 'DESCONECTADO';

    // O número aparece no primeiro CONNECTION_UPDATE depois do QR lido; nos
    // seguintes some. Por isso só sobrescreve quando vem.
    const numero =
      payload?.data?.wuid ??
      payload?.sender ??
      payload?.data?.me?.id ??
      null;

    this.logger.log(
      `Canal ${channel.id} (${channel.name}): WhatsApp ${status.toLowerCase()}`,
    );
    await this.registrar(channel.id, status, numero);
  }

  static lerStatus(channel: Channel): StatusDoCanal {
    const cfg = (channel.config ?? {}) as Record<string, any>;
    return (cfg.connectionStatus as StatusDoCanal) ?? 'DESCONECTADO';
  }
}
