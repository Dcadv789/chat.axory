import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import {
  NormalizedInboundMessage,
  NormalizedOutboundMessage,
  MessageContentType,
  StatusUpdate,
  TemplateButton,
  TemplateElement,
} from '../../ports/types';

@Injectable()
export class InstagramMessageMapper {
  normalizeInbound(messaging: Record<string, any>): NormalizedInboundMessage | null {
    const senderId = messaging.sender?.id;
    const recipientId = messaging.recipient?.id;
    const message = messaging.message;
    if (!senderId || !message) return null;

    const isEcho = !!message.is_echo;
    // For echo events (sent from IG app by our account), the "contact" is the recipient,
    // not the sender (which is us).
    const externalContactId = isEcho ? recipientId : senderId;
    if (!externalContactId) return null;

    const result: NormalizedInboundMessage = {
      externalMessageId: message.mid,
      externalContactId,
      channelType: ChannelType.INSTAGRAM,
      timestamp: new Date(messaging.timestamp),
      type: this.resolveContentType(message),
      content: this.extractContent(message),
      isEcho,
      rawPayload: messaging,
    };

    // Instagram reply contexts. `reply_to` may contain:
    //   - mid (reply to a message)
    //   - story { id, url } (reply to a story) — our core use case
    //   - ad    { id, title } (reply to an ad)
    // Story mentions arrive as attachments[type=story_mention] with a CDN url.
    const replyTo = this.extractReplyContext(message);
    if (replyTo) {
      result.replyTo = replyTo;
    }

    return result;
  }

  private extractReplyContext(message: Record<string, any>): NormalizedInboundMessage['replyTo'] | undefined {
    const rt = message.reply_to;
    if (rt?.story?.id || rt?.story?.url) {
      return {
        story: {
          id: rt.story.id ? String(rt.story.id) : undefined,
          url: rt.story.url,
          kind: 'reply',
        },
      };
    }
    if (rt?.ad?.id) {
      return { ad: { id: String(rt.ad.id), title: rt.ad.title } };
    }
    if (rt?.mid) {
      return { externalMessageId: String(rt.mid) };
    }
    // Story mention: surfaces as a standalone attachment, not as reply_to.
    const attachment = message.attachments?.[0];
    if (attachment?.type === 'story_mention') {
      return {
        story: {
          url: attachment.payload?.url,
          kind: 'mention',
        },
      };
    }
    return undefined;
  }

  /**
   * Normaliza um evento de COMENTÁRIO do Instagram (entry.changes field=comments)
   * em uma mensagem de entrada. O autor do comentário vira o "contato", e o texto
   * carrega uma linha de contexto com os ids acionáveis (commentId pra responder,
   * IGSID pra DM, mediaId do post) — assim o agente de marketing consegue agir.
   */
  normalizeComment(
    value: Record<string, any>,
    entryTime?: number,
  ): NormalizedInboundMessage | null {
    const fromId = value?.from?.id;
    const commentId = value?.id;
    if (!fromId || !commentId) return null;

    const username = value?.from?.username
      ? String(value.from.username)
      : undefined;
    const mediaId = value?.media?.id ? String(value.media.id) : undefined;
    const text = value?.text ? String(value.text).trim() : '';

    const ctx =
      `[Comentário do Instagram${username ? ' de @' + username : ''} — ` +
      `responda com replyToInstagramComment(commentId="${commentId}"); ` +
      `pra enviar material por DM use recipientId="${fromId}"; ` +
      `post mediaId="${mediaId ?? '?'}"]`;

    return {
      externalMessageId: String(commentId),
      externalContactId: String(fromId),
      contactName: username,
      channelType: ChannelType.INSTAGRAM,
      timestamp: entryTime ? new Date(entryTime * 1000) : new Date(),
      type: MessageContentType.TEXT,
      content: { text: text ? `${text}\n\n${ctx}` : ctx },
      comment: {
        commentId: String(commentId),
        mediaId,
        authorIgsid: String(fromId),
        username,
        parentId: value?.parent_id ? String(value.parent_id) : undefined,
        text: text || undefined,
      },
      rawPayload: value,
    };
  }

  /**
   * Clique em botão / ice breaker / quick reply (`messaging_postbacks`). O que
   * o cliente tocou não chega como `message` — sem tratar isso, o toque some e
   * a conversa trava esperando um texto que nunca vem.
   */
  normalizePostback(messaging: Record<string, any>): NormalizedInboundMessage | null {
    const senderId = messaging.sender?.id;
    const postback = messaging.postback;
    if (!senderId || !postback) return null;

    const title = postback.title ? String(postback.title) : '';
    const payload = postback.payload ? String(postback.payload) : undefined;

    return {
      externalMessageId: postback.mid
        ? String(postback.mid)
        : `ig-postback:${senderId}:${messaging.timestamp}`,
      externalContactId: String(senderId),
      channelType: ChannelType.INSTAGRAM,
      timestamp: new Date(messaging.timestamp),
      type: MessageContentType.INTERACTIVE,
      content: {
        text: title,
        interactive: { type: 'postback', buttonId: payload },
      },
      rawPayload: messaging,
    };
  }

  /**
   * Origem da conversa (`messaging_referral`): anúncio Click-to-Instagram-DM,
   * link ig.me ou story. É a atribuição de campanha — sem isso a crew de
   * marketing não sabe qual anúncio trouxe o lead.
   *
   * Só vem sozinho quando a thread JÁ existe; numa conversa nova o referral
   * chega grudado no primeiro `message` (campo `referral` no mesmo evento).
   */
  normalizeReferral(messaging: Record<string, any>): NormalizedInboundMessage | null {
    const senderId = messaging.sender?.id;
    const referral = messaging.referral;
    if (!senderId || !referral) return null;

    const ads = referral.ads_context_data;
    const source = referral.source ? String(referral.source) : 'DESCONHECIDA';
    const descricao = ads?.ad_title
      ? `anúncio "${ads.ad_title}"`
      : referral.ref
        ? `referência "${referral.ref}"`
        : `origem ${source}`;

    const result: NormalizedInboundMessage = {
      externalMessageId: `ig-referral:${senderId}:${messaging.timestamp}`,
      externalContactId: String(senderId),
      channelType: ChannelType.INSTAGRAM,
      timestamp: new Date(messaging.timestamp),
      type: MessageContentType.SYSTEM,
      content: { text: `[Cliente chegou por ${descricao} — origem ${source}]` },
      rawPayload: messaging,
    };

    // Reaproveita o mesmo formato de contexto de anúncio já usado no reply_to,
    // pra quem consome não precisar aprender uma segunda forma.
    if (ads?.ad_title || referral.ad_id) {
      result.replyTo = {
        ad: {
          id: referral.ad_id ? String(referral.ad_id) : undefined,
          title: ads?.ad_title,
        },
      };
    }

    return result;
  }

  /**
   * Reação (curtida) numa DM. `unreact` é ignorado — o AxChat não guarda
   * histórico de reação removida, então registrar só a retirada confundiria.
   */
  normalizeReaction(messaging: Record<string, any>): NormalizedInboundMessage | null {
    const senderId = messaging.sender?.id;
    const reaction = messaging.reaction;
    if (!senderId || !reaction?.mid) return null;
    if (reaction.action && reaction.action !== 'react') return null;

    const emoji = reaction.emoji ? String(reaction.emoji) : '❤️';

    return {
      externalMessageId: `ig-reaction:${reaction.mid}:${messaging.timestamp}`,
      externalContactId: String(senderId),
      channelType: ChannelType.INSTAGRAM,
      timestamp: new Date(messaging.timestamp),
      type: MessageContentType.REACTION,
      content: {
        reaction: { emoji, targetMessageId: String(reaction.mid) },
      },
      rawPayload: messaging,
    };
  }

  normalizeStatus(messaging: Record<string, any>): StatusUpdate | null {
    const delivery = messaging.delivery;
    if (!delivery?.mids?.length) return null;

    return {
      externalMessageId: delivery.mids[0],
      status: 'delivered',
      timestamp: new Date(messaging.timestamp),
    };
  }

  /**
   * Meta sends `read` with a `watermark` timestamp (no mids).
   * We use the watermark to flip status to READ for every matching outbound
   * message up to that timestamp — the processor handles the bulk update.
   */
  normalizeReadStatus(messaging: Record<string, any>): StatusUpdate | null {
    const read = messaging.read;
    if (!read?.watermark) return null;
    return {
      externalMessageId: `ig-read-watermark:${read.watermark}`,
      status: 'read',
      timestamp: new Date(Number(read.watermark) || messaging.timestamp),
    };
  }

  denormalize(
    message: NormalizedOutboundMessage,
    contactExternalId: string,
  ): Record<string, any> {
    // Instagram Messenger Platform NÃO permite reply nativo em DM
    // (api só aceita reply em comentários/stories de outro fluxo).
    // Fallback: prefixa a mensagem com um quote textual mostrando o
    // sender + trecho da msg citada. Cliente vê uma "citação" inline
    // ao invés da bolha-resposta nativa, mas a referência fica clara.
    const quotePrefix = buildIgQuotePrefix(message.replyTo);
    const applyQuoteToText = (text: string): string =>
      quotePrefix ? `${quotePrefix}${text}` : text;

    const base = { recipient: { id: contactExternalId }, ...this.sendWindowFields(message) };

    switch (message.type) {
      case MessageContentType.TEXT:
        return {
          ...base,
          message: { text: applyQuoteToText(message.content.text || '') },
        };

      case MessageContentType.IMAGE: {
        // Mídia não tem campo "caption" no payload da MP — se houver
        // quote pra anexar, manda o quote como mensagem separada antes.
        // Aqui só retorna a mídia; o adapter não suporta envio composto,
        // então degradamos: quote vira texto antes da mídia via 2 sends
        // já existentes (typing indicator), mas pra simplicidade hoje
        // apenas ignoramos quote em mídia. UI sinaliza o usuário.
        return {
          ...base,
          message: {
            attachment: {
              type: 'image',
              payload: { url: message.content.mediaUrl, is_reusable: true },
            },
          },
        };
      }

      case MessageContentType.AUDIO:
        return {
          ...base,
          message: {
            attachment: {
              type: 'audio',
              payload: { url: message.content.mediaUrl, is_reusable: true },
            },
          },
        };

      case MessageContentType.VIDEO:
        return {
          ...base,
          message: {
            attachment: {
              type: 'video',
              payload: { url: message.content.mediaUrl, is_reusable: true },
            },
          },
        };

      case MessageContentType.DOCUMENT:
        return {
          ...base,
          message: {
            attachment: {
              type: 'file',
              payload: { url: message.content.mediaUrl, is_reusable: true },
            },
          },
        };

      default:
        return {
          ...base,
          message: { text: applyQuoteToText(message.content.text || '') },
        };
    }
  }

  /** Janela padrão da Meta pra responder livremente: 24h da última msg do cliente. */
  private static readonly STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;

  /**
   * Decide `messaging_type` (obrigatório na Send API) e, quando cabível, a tag
   * HUMAN_AGENT — a única forma de responder entre 24h e 7 dias.
   *
   * A política da Meta é explícita: HUMAN_AGENT é "Disallowed" para mensagem
   * automática. Por isso a IA nunca recebe a tag — se ela tentar responder
   * fora das 24h, o envio falha na Meta, que é o comportamento correto e não
   * um bug nosso. Marcar automático como humano arriscaria a conta do cliente
   * perder o direito de enviar mensagens.
   */
  private sendWindowFields(
    message: NormalizedOutboundMessage,
  ): Record<string, string> {
    const janela = message.sendWindow;
    const desde = janela?.lastInboundAt
      ? Date.now() - new Date(janela.lastInboundAt).getTime()
      : null;
    const foraDaJanela =
      desde !== null && desde > InstagramMessageMapper.STANDARD_WINDOW_MS;

    if (foraDaJanela && janela?.fromHumanAgent) {
      return { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' };
    }
    return { messaging_type: 'RESPONSE' };
  }

  private resolveContentType(msg: Record<string, any>): MessageContentType {
    if (msg.text) return MessageContentType.TEXT;
    if (msg.attachments?.length) {
      const type = msg.attachments[0].type;
      const map: Record<string, MessageContentType> = {
        image: MessageContentType.IMAGE,
        audio: MessageContentType.AUDIO,
        video: MessageContentType.VIDEO,
        file: MessageContentType.DOCUMENT,
        share: MessageContentType.TEXT,
        story_mention: MessageContentType.TEXT,
        reel: MessageContentType.VIDEO,
        template: MessageContentType.TEMPLATE,
      };
      return map[type] || MessageContentType.TEXT;
    }
    return MessageContentType.TEXT;
  }

  private extractContent(msg: Record<string, any>): NormalizedInboundMessage['content'] {
    if (msg.text) {
      return { text: msg.text };
    }

    if (msg.attachments?.length) {
      const att = msg.attachments[0];
      const payload = att.payload || {};

      switch (att.type) {
        case 'image':
          return { mediaUrl: payload.url, mimeType: 'image/jpeg' };
        case 'audio':
          return { mediaUrl: payload.url, mimeType: 'audio/mp4' };
        case 'video':
        case 'reel':
          return { mediaUrl: payload.url, mimeType: 'video/mp4' };
        case 'file':
          return { mediaUrl: payload.url };
        case 'share':
          return { text: payload.url || '[Shared content]' };
        case 'story_mention':
          return { text: '[Story mention]', mediaUrl: payload.url };
        case 'template':
          return this.extractTemplateContent(payload);
        default:
          return { text: `[${att.type}]` };
      }
    }

    return { text: '[Unsupported message]' };
  }

  private extractTemplateContent(payload: Record<string, any>): NormalizedInboundMessage['content'] {
    // Instagram nests data under a key named after the template type
    // (e.g. payload.generic.elements, payload.button.buttons). Older shapes
    // also expose template_type + sibling fields directly on payload.
    const wrapperKey = Object.keys(payload).find(
      (k) => payload[k] && typeof payload[k] === 'object' && !Array.isArray(payload[k]),
    );
    const inner =
      wrapperKey && (payload[wrapperKey] as Record<string, any>) ? payload[wrapperKey] : payload;
    const templateType =
      (payload.template_type as string | undefined) || wrapperKey || undefined;

    const mapBtn = (b: any): TemplateButton => ({
      type: String(b?.type ?? 'web_url'),
      title: String(b?.title ?? ''),
      url: b?.url ? String(b.url) : undefined,
      payload: b?.payload ? String(b.payload) : undefined,
    });

    const rawButtons = Array.isArray(inner.buttons)
      ? inner.buttons
      : Array.isArray(payload.buttons)
        ? payload.buttons
        : [];
    const buttons: TemplateButton[] = rawButtons.map(mapBtn);

    const rawElements = Array.isArray(inner.elements)
      ? inner.elements
      : Array.isArray(payload.elements)
        ? payload.elements
        : [];
    const elements: TemplateElement[] = rawElements.map((el: any) => ({
      title: el?.title ? String(el.title) : undefined,
      subtitle: el?.subtitle ? String(el.subtitle) : undefined,
      imageUrl: el?.image_url ? String(el.image_url) : undefined,
      defaultActionUrl: el?.default_action?.url ? String(el.default_action.url) : undefined,
      buttons: Array.isArray(el?.buttons) ? el.buttons.map(mapBtn) : undefined,
    }));

    const headerText =
      (inner.text ? String(inner.text) : undefined) ||
      (payload.text ? String(payload.text) : undefined);
    const elementText = elements
      .map((el) => [el.title, el.subtitle].filter(Boolean).join(' — '))
      .filter(Boolean)
      .join('\n');
    const text = headerText || elementText || undefined;

    return {
      text,
      template: {
        templateType,
        text: headerText,
        buttons: buttons.length ? buttons : undefined,
        elements: elements.length ? elements : undefined,
      },
    };
  }
}

/**
 * Monta o prefixo de quote pro fallback de reply no Instagram DM.
 *
 *   > [Nome] disse:
 *   > trecho da mensagem citada
 *
 *   resposta original
 *
 * Limita o trecho a 120 chars pra não inflar mensagens curtas. Retorna
 * string vazia quando não há replyTo ou quando previewText/senderName
 * vêm sem conteúdo útil — nesse caso melhor não citar nada do que
 * mostrar "> undefined" pro cliente.
 */
function buildIgQuotePrefix(
  replyTo: NormalizedOutboundMessage['replyTo'],
): string {
  if (!replyTo) return '';
  const sender = replyTo.senderName?.trim();
  let preview = replyTo.previewText?.trim() ?? '';
  if (!sender && !preview) return '';
  if (preview.length > 120) preview = preview.slice(0, 117) + '…';
  // Newline-formatado pra renderizar como bloco "citado" no IG.
  const senderLine = sender ? `> ${sender} disse:\n` : '';
  const previewLine = preview ? `> ${preview}\n\n` : '\n';
  return `${senderLine}${previewLine}`;
}
