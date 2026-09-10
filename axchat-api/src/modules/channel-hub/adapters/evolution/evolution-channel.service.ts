import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Channel, ChannelType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../../database/prisma.service';
import { EvolutionHttpClient } from './evolution.http-client';
import { EvolutionSettingsService } from './evolution-settings.service';
import {
  EvolutionConnectionService,
  StatusDoCanal,
} from './evolution-connection.service';

export interface RespostaDeConexao {
  channelId: string;
  status: StatusDoCanal;
  /** Imagem pronta pra `<img src>`. Null quando já está conectado. */
  qrCode: string | null;
  /** Alternativa ao QR: código que a pessoa digita no celular. */
  pairingCode: string | null;
  connectedNumber: string | null;
}

/**
 * O caminho do "clicar e ler o QR".
 *
 * Tudo que é técnico — endereço do servidor, chave global, nome da instância,
 * URL de webhook, segredo — é decidido aqui e nunca chega à tela do cliente.
 * Pra ele o canal tem um nome e um QR code.
 */
@Injectable()
export class EvolutionChannelService {
  private readonly logger = new Logger(EvolutionChannelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: EvolutionHttpClient,
    private readonly settings: EvolutionSettingsService,
    private readonly conexao: EvolutionConnectionService,
  ) {}

  /**
   * O nome da instância no servidor Evolution.
   *
   * Deriva do id do canal porque precisa ser único no servidor inteiro, que é
   * compartilhado por todos os clientes: dois clientes chamando o canal de
   * "Comercial" não podem colidir. E, quando alguém for depurar direto no
   * servidor, o nome diz de qual canal se trata.
   */
  private nomeDaInstancia(channelId: string): string {
    return `axchat_${channelId}`;
  }

  private urlDoWebhook(): string {
    const base = (process.env.APP_URL || '').replace(/\/+$/, '');
    if (!base) {
      throw new BadRequestException(
        'APP_URL não configurada na API — sem ela a Evolution não teria pra onde mandar as mensagens recebidas.',
      );
    }
    return `${base}/api/v1/webhooks/WHATSAPP_EVOLUTION`;
  }

  private async buscarCanal(
    organizationId: string,
    channelId: string,
  ): Promise<Channel> {
    const canal = await this.prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId,
        type: ChannelType.WHATSAPP_EVOLUTION,
        deletedAt: null,
      },
    });
    if (!canal) throw new NotFoundException('Canal não encontrado.');
    return canal;
  }

  /** A tela só oferece o canal quando o Super Admin já apontou um servidor. */
  async disponivel(): Promise<{ disponivel: boolean; motivo: string | null }> {
    const ok = await this.settings.isConfigured();
    return {
      disponivel: ok,
      motivo: ok
        ? null
        : 'O WhatsApp não oficial ainda não foi liberado para esta plataforma. Fale com o suporte.',
    };
  }

  /**
   * Cria a instância no servidor e devolve o primeiro QR.
   *
   * O canal já existe quando isto roda: a instância é nomeada com o id dele, e
   * inventar um id antes de gravar deixaria lixo no servidor se a gravação
   * falhasse depois.
   */
  async conectar(
    organizationId: string,
    channelId: string,
  ): Promise<RespostaDeConexao> {
    const canal = await this.buscarCanal(organizationId, channelId);
    const config = { ...((canal.config ?? {}) as Record<string, any>) };

    // Já conectado: não gera QR novo. Gerar derrubaria a sessão ativa do
    // cliente — ele perderia o WhatsApp funcionando por ter clicado em
    // "conectar" por engano.
    if (config.instanceName) {
      const estado = await this.http.connectionState(canal);
      if (estado === 'open') {
        await this.conexao.registrar(canal.id, 'CONECTADO');
        return {
          channelId: canal.id,
          status: 'CONECTADO',
          qrCode: null,
          pairingCode: null,
          connectedNumber: config.connectedNumber ?? null,
        };
      }

      // Instância existe mas está fora: só pede QR novo.
      const nova = await this.http.connect(canal);
      await this.guardarQr(canal.id, config, nova.qrBase64);
      return {
        channelId: canal.id,
        status: 'CONECTANDO',
        qrCode: nova.qrBase64,
        pairingCode: nova.pairingCode,
        connectedNumber: config.connectedNumber ?? null,
      };
    }

    // Primeira conexão: cria a instância.
    const instanceName = this.nomeDaInstancia(canal.id);
    const webhookSecret =
      canal.webhookSecret || crypto.randomBytes(24).toString('hex');

    const criada = await this.http.createInstance(
      instanceName,
      this.urlDoWebhook(),
      webhookSecret,
    );

    config.instanceName = criada.instanceName;
    if (criada.token) config.instanceToken = criada.token;
    config.connectionStatus = 'CONECTANDO';
    if (criada.qrBase64) config.lastQrCode = criada.qrBase64;

    await this.prisma.channel.update({
      where: { id: canal.id },
      // O canal continua ATIVO: quem decide isso é o cliente, não o estado do
      // pareamento. Se desativássemos até parear, o próprio webhook que avisa
      // "conectou" seria descartado — o roteador só procura entre ativos.
      // Mandar mensagem antes de parear falha com erro claro da Evolution, que
      // é bem melhor que um canal mudo sem explicação.
      data: {
        config: config as Prisma.InputJsonValue,
        webhookSecret,
      },
    });

    this.logger.log(
      `Instância ${instanceName} criada para o canal ${canal.id} (${canal.name}).`,
    );

    return {
      channelId: canal.id,
      status: 'CONECTANDO',
      qrCode: criada.qrBase64,
      pairingCode: criada.pairingCode,
      connectedNumber: null,
    };
  }

  private async guardarQr(
    channelId: string,
    config: Record<string, any>,
    qr: string | null,
  ) {
    if (!qr) return;
    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        config: { ...config, lastQrCode: qr } as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Estado atual, perguntando ao servidor.
   *
   * É isto que a tela consulta enquanto o QR está aberto. Confia no servidor e
   * não no que está gravado, porque o gravado só muda quando chega webhook — e
   * durante o pareamento a resposta precisa ser imediata.
   */
  async status(
    organizationId: string,
    channelId: string,
  ): Promise<RespostaDeConexao> {
    const canal = await this.buscarCanal(organizationId, channelId);
    const config = (canal.config ?? {}) as Record<string, any>;

    if (!config.instanceName) {
      return {
        channelId: canal.id,
        status: 'DESCONECTADO',
        qrCode: null,
        pairingCode: null,
        connectedNumber: null,
      };
    }

    const estado = await this.http.connectionState(canal);
    const status = EvolutionConnectionService.traduzir(estado);
    await this.conexao.registrar(canal.id, status);

    return {
      channelId: canal.id,
      status,
      // QR só faz sentido enquanto não conectou.
      qrCode: status === 'CONECTADO' ? null : (config.lastQrCode ?? null),
      pairingCode: null,
      connectedNumber: config.connectedNumber ?? null,
    };
  }

  /** Desliga o celular do canal, mantendo a instância pra reconectar depois. */
  async desconectar(
    organizationId: string,
    channelId: string,
  ): Promise<{ status: StatusDoCanal }> {
    const canal = await this.buscarCanal(organizationId, channelId);
    await this.http.logout(canal);
    await this.conexao.registrar(canal.id, 'DESCONECTADO');
    return { status: 'DESCONECTADO' };
  }

  /**
   * Apaga a instância no servidor. Chamado quando o canal é removido — sem
   * isso o servidor acumula instâncias órfãs consumindo memória, e cada uma
   * segue tentando reconectar um WhatsApp que ninguém mais lê.
   */
  async removerInstancia(channel: Channel): Promise<void> {
    if (channel.type !== ChannelType.WHATSAPP_EVOLUTION) return;
    await this.http.deleteInstance(channel);
  }
}
