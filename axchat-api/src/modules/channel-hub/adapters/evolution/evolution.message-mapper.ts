import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import {
  MessageContentType,
  NormalizedInboundMessage,
  NormalizedOutboundMessage,
  StatusUpdate,
} from '../../ports/types';

/** Tira o sufixo do JID: "5511999@s.whatsapp.net" -> "5511999". */
export function soONumero(jid: string): string {
  return String(jid ?? '').replace(/@(s\.whatsapp\.net|g\.us|lid)$/i, '');
}

/**
 * Tradutor entre o formato da Evolution (Baileys cru) e o nosso.
 *
 * A Evolution repassa o objeto do Baileys quase intacto, e o Baileys guarda o
 * texto em lugares diferentes conforme o tipo: `conversation` numa mensagem
 * simples, `extendedTextMessage.text` quando tem citação ou link, e `caption`
 * quando é legenda de mídia. Ler só o primeiro faz a mensagem chegar vazia na
 * caixa de entrada — o atendente vê o contato aparecer sem texto nenhum.
 */
@Injectable()
export class EvolutionMessageMapper {
  private readonly logger = new Logger(EvolutionMessageMapper.name);

  /**
   * A Evolution mudou o encaixe do `data` entre versões: umas mandam a
   * mensagem direto em `data`, outras aninham em `data.message`. Aceito as
   * duas — a alternativa é o canal parar de receber num upgrade do servidor,
   * com o webhook respondendo 200 e nada aparecendo.
   */
  extrairMensagens(payload: any): any[] {
    const data = payload?.data;
    if (!data) return [];
    const lista = Array.isArray(data) ? data : [data];
    return lista
      .map((d) => (d?.key ? d : d?.message?.key ? d.message : null))
      .filter(Boolean);
  }

  normalizar(bruto: any): NormalizedInboundMessage | null {
    const key = bruto?.key;
    if (!key?.id || !key?.remoteJid) return null;

    const jid = String(key.remoteJid);
    const ehGrupo = jid.endsWith('@g.us');
    const { tipo, conteudo } = this.lerConteudo(bruto?.message ?? {});

    // Mensagem sem nada legível (protocolo, chave de criptografia, sinalização
    // interna do Baileys). Descartar aqui é melhor que criar uma conversa vazia.
    if (!tipo) return null;

    return {
      externalMessageId: String(key.id),
      // Em grupo, o dono da conversa é o grupo; quem falou vai em senderName.
      externalContactId: ehGrupo ? jid : soONumero(jid),
      contactName: bruto?.pushName ?? undefined,
      contactPhone: ehGrupo ? undefined : soONumero(jid),
      channelType: ChannelType.WHATSAPP_EVOLUTION,
      timestamp: this.lerData(bruto?.messageTimestamp),
      type: tipo,
      content: conteudo,
      isGroup: ehGrupo,
      // `fromMe` é o eco do que saiu do celular do cliente — inclusive do que
      // ele mandou pelo app, à mão. Marcar como eco deixa o pipeline registrar
      // sem responder de novo.
      isEcho: !!key.fromMe,
      senderName: bruto?.pushName ?? undefined,
      replyTo: this.lerCitacao(bruto?.message ?? {}),
      rawPayload: bruto,
    };
  }

  private lerConteudo(msg: any): {
    tipo: MessageContentType | null;
    conteudo: NormalizedInboundMessage['content'];
  } {
    if (msg?.conversation) {
      return { tipo: MessageContentType.TEXT, conteudo: { text: msg.conversation } };
    }
    if (msg?.extendedTextMessage?.text) {
      return {
        tipo: MessageContentType.TEXT,
        conteudo: { text: msg.extendedTextMessage.text },
      };
    }
    if (msg?.imageMessage) {
      return {
        tipo: MessageContentType.IMAGE,
        conteudo: {
          caption: msg.imageMessage.caption ?? undefined,
          text: msg.imageMessage.caption ?? undefined,
          mimeType: msg.imageMessage.mimetype ?? 'image/jpeg',
          // A Evolution manda o base64 quando o webhook foi criado com
          // `base64: true`; senão sobra a URL criptografada, que o navegador
          // não abre — quem resolve isso é o resolvedor de mídia.
          mediaUrl: msg.imageMessage.url ?? undefined,
        },
      };
    }
    if (msg?.audioMessage) {
      return {
        tipo: MessageContentType.AUDIO,
        conteudo: {
          mimeType: msg.audioMessage.mimetype ?? 'audio/ogg',
          mediaUrl: msg.audioMessage.url ?? undefined,
        },
      };
    }
    if (msg?.videoMessage) {
      return {
        tipo: MessageContentType.VIDEO,
        conteudo: {
          caption: msg.videoMessage.caption ?? undefined,
          text: msg.videoMessage.caption ?? undefined,
          mimeType: msg.videoMessage.mimetype ?? 'video/mp4',
          mediaUrl: msg.videoMessage.url ?? undefined,
        },
      };
    }
    if (msg?.documentMessage || msg?.documentWithCaptionMessage) {
      const doc =
        msg.documentMessage ??
        msg.documentWithCaptionMessage?.message?.documentMessage;
      return {
        tipo: MessageContentType.DOCUMENT,
        conteudo: {
          fileName: doc?.fileName ?? undefined,
          text: doc?.caption ?? doc?.fileName ?? undefined,
          mimeType: doc?.mimetype ?? undefined,
          mediaUrl: doc?.url ?? undefined,
        },
      };
    }
    if (msg?.stickerMessage) {
      return {
        tipo: MessageContentType.STICKER,
        conteudo: {
          mimeType: msg.stickerMessage.mimetype ?? 'image/webp',
          mediaUrl: msg.stickerMessage.url ?? undefined,
        },
      };
    }
    if (msg?.locationMessage) {
      return {
        tipo: MessageContentType.LOCATION,
        conteudo: {
          latitude: msg.locationMessage.degreesLatitude,
          longitude: msg.locationMessage.degreesLongitude,
        },
      };
    }
    if (msg?.reactionMessage) {
      return {
        tipo: MessageContentType.REACTION,
        conteudo: {
          reaction: {
            emoji: msg.reactionMessage.text ?? '',
            targetMessageId: msg.reactionMessage.key?.id ?? '',
          },
        },
      };
    }
    // Botão/lista respondida: o que importa é o texto que a pessoa escolheu.
    const escolha =
      msg?.buttonsResponseMessage?.selectedDisplayText ??
      msg?.listResponseMessage?.title ??
      msg?.templateButtonReplyMessage?.selectedDisplayText;
    if (escolha) {
      return { tipo: MessageContentType.TEXT, conteudo: { text: escolha } };
    }

    return { tipo: null, conteudo: {} };
  }

  private lerCitacao(msg: any): NormalizedInboundMessage['replyTo'] {
    const ctx =
      msg?.extendedTextMessage?.contextInfo ??
      msg?.imageMessage?.contextInfo ??
      msg?.videoMessage?.contextInfo;
    const id = ctx?.stanzaId;
    return id ? { externalMessageId: String(id) } : undefined;
  }

  /**
   * O Baileys manda segundos; `new Date(segundos)` daria 1970 e a mensagem
   * apareceria no topo da conversa, fora de ordem.
   */
  private lerData(ts: unknown): Date {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return new Date();
    return new Date(n < 1e12 ? n * 1000 : n);
  }

  /** MESSAGES_UPDATE vira confirmação de entrega/leitura. */
  lerStatus(payload: any): StatusUpdate[] {
    const lista = Array.isArray(payload?.data) ? payload.data : [payload?.data];
    const mapa: Record<string, StatusUpdate['status']> = {
      DELIVERY_ACK: 'delivered',
      READ: 'read',
      PLAYED: 'read',
      SERVER_ACK: 'sent',
      ERROR: 'failed',
    };

    return lista
      .filter((d: any) => d?.keyId || d?.key?.id)
      .map((d: any) => {
        const status = mapa[String(d?.status ?? '').toUpperCase()];
        if (!status) return null;
        return {
          externalMessageId: String(d.keyId ?? d.key?.id),
          status,
          timestamp: new Date(),
        };
      })
      .filter(Boolean) as StatusUpdate[];
  }

  /**
   * Nosso formato -> chamada da Evolution.
   *
   * A Evolution v2 achatou o corpo (`{number, text}`); a v1 aninhava em
   * `textMessage`. Mando o formato novo, que é o suportado.
   */
  desnormalizar(
    message: NormalizedOutboundMessage,
    contactExternalId: string,
  ): { endpoint: string; payload: Record<string, any> } {
    const number = soONumero(contactExternalId);
    const citado = message.replyTo?.externalMessageId;

    // `quoted` faz o WhatsApp desenhar a bolha de resposta nativa. Sem ele a
    // resposta chega solta e, numa conversa movimentada, o cliente não sabe a
    // que pergunta estamos respondendo.
    const comCitacao = <T extends Record<string, any>>(p: T): T =>
      citado ? ({ ...p, quoted: { key: { id: citado } } } as T) : p;

    switch (message.type) {
      case MessageContentType.IMAGE:
      case MessageContentType.VIDEO:
      case MessageContentType.DOCUMENT:
        return {
          endpoint: '/message/sendMedia',
          payload: comCitacao({
            number,
            mediatype:
              message.type === MessageContentType.IMAGE
                ? 'image'
                : message.type === MessageContentType.VIDEO
                  ? 'video'
                  : 'document',
            mimetype: message.content.mimeType,
            media: message.content.mediaUrl,
            fileName: message.content.fileName,
            caption: message.content.caption || message.content.text || undefined,
          }),
        };

      case MessageContentType.AUDIO:
        return {
          // Endpoint próprio: manda como áudio de voz (aquele com a onda e o
          // play). Por /sendMedia chegaria como arquivo anexado, que é outra
          // coisa pra quem recebe.
          endpoint: '/message/sendWhatsAppAudio',
          payload: comCitacao({ number, audio: message.content.mediaUrl }),
        };

      case MessageContentType.LOCATION:
        return {
          endpoint: '/message/sendLocation',
          payload: comCitacao({
            number,
            latitude: message.content.latitude,
            longitude: message.content.longitude,
          }),
        };

      case MessageContentType.REACTION:
        return {
          endpoint: '/message/sendReaction',
          payload: {
            key: { id: message.content.reaction?.targetMessageId },
            reaction: message.content.reaction?.emoji ?? '',
          },
        };

      default:
        return {
          endpoint: '/message/sendText',
          payload: comCitacao({
            number,
            text: message.content.text ?? message.content.caption ?? '',
          }),
        };
    }
  }
}
