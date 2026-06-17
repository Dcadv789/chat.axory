import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import {
  MessageContentType,
  NormalizedInboundMessage,
  NormalizedOutboundMessage,
  StatusUpdate,
} from '../../ports/types';

@Injectable()
export class TelegramMessageMapper {
  normalizeUpdate(update: Record<string, any>): NormalizedInboundMessage | null {
    const message =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;
    if (!message?.chat?.id || !message.message_id) return null;

    const chat = message.chat;
    const from = message.from || message.sender_chat || chat;
    const externalContactId = String(chat.id);
    const senderName = this.senderName(from);

    return {
      externalMessageId: `${chat.id}:${message.message_id}`,
      externalContactId,
      contactName: chat.type === 'private' ? senderName : chat.title || senderName,
      contactPhone: undefined,
      contactAvatarUrl: undefined,
      channelType: ChannelType.TELEGRAM,
      timestamp: new Date((message.date || Math.floor(Date.now() / 1000)) * 1000),
      type: this.resolveContentType(message),
      content: this.extractContent(message),
      replyTo: message.reply_to_message?.message_id
        ? { externalMessageId: `${chat.id}:${message.reply_to_message.message_id}` }
        : undefined,
      isForwarded: !!message.forward_origin || !!message.forward_from,
      isGroup: chat.type !== 'private',
      senderName,
      rawPayload: update,
    };
  }

  normalizeStatus(_update: Record<string, any>): StatusUpdate | null {
    return null;
  }

  denormalize(
    message: NormalizedOutboundMessage,
    contactExternalId: string,
  ): { method: string; payload: Record<string, any> } {
    const base: Record<string, any> = {
      chat_id: contactExternalId,
      ...(message.replyTo?.externalMessageId
        ? { reply_to_message_id: this.extractTelegramMessageId(message.replyTo.externalMessageId) }
        : {}),
    };

    const text = message.content.text || message.content.caption || '';
    switch (message.type) {
      case MessageContentType.IMAGE:
        return {
          method: 'sendPhoto',
          payload: { ...base, photo: message.content.mediaUrl, caption: text || undefined },
        };
      case MessageContentType.AUDIO:
        return {
          method: 'sendAudio',
          payload: { ...base, audio: message.content.mediaUrl, caption: text || undefined },
        };
      case MessageContentType.VIDEO:
        return {
          method: 'sendVideo',
          payload: { ...base, video: message.content.mediaUrl, caption: text || undefined },
        };
      case MessageContentType.DOCUMENT:
        return {
          method: 'sendDocument',
          payload: {
            ...base,
            document: message.content.mediaUrl,
            caption: text || undefined,
          },
        };
      case MessageContentType.LOCATION:
        return {
          method: 'sendLocation',
          payload: {
            ...base,
            latitude: message.content.latitude,
            longitude: message.content.longitude,
          },
        };
      default:
        return {
          method: 'sendMessage',
          payload: {
            ...base,
            text: text || '[Mensagem sem texto]',
            disable_web_page_preview: false,
          },
        };
    }
  }

  private resolveContentType(message: Record<string, any>): MessageContentType {
    if (message.text) return MessageContentType.TEXT;
    if (message.photo?.length) return MessageContentType.IMAGE;
    if (message.voice || message.audio) return MessageContentType.AUDIO;
    if (message.video || message.video_note) return MessageContentType.VIDEO;
    if (message.document || message.animation) return MessageContentType.DOCUMENT;
    if (message.sticker) return MessageContentType.STICKER;
    if (message.location) return MessageContentType.LOCATION;
    return MessageContentType.TEXT;
  }

  private extractContent(message: Record<string, any>): NormalizedInboundMessage['content'] {
    if (message.text) return { text: message.text };

    if (message.photo?.length) {
      const photo = [...message.photo].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
      return {
        mediaId: photo.file_id,
        fileSize: photo.file_size,
        caption: message.caption,
        text: message.caption,
        mimeType: 'image/jpeg',
      };
    }

    const audio = message.voice || message.audio;
    if (audio) {
      return {
        mediaId: audio.file_id,
        fileName: audio.file_name,
        fileSize: audio.file_size,
        mimeType: audio.mime_type || (message.voice ? 'audio/ogg' : undefined),
        caption: message.caption,
        text: message.caption,
      };
    }

    const video = message.video || message.video_note;
    if (video) {
      return {
        mediaId: video.file_id,
        fileName: video.file_name,
        fileSize: video.file_size,
        mimeType: video.mime_type || 'video/mp4',
        caption: message.caption,
        text: message.caption,
      };
    }

    const document = message.document || message.animation || message.sticker;
    if (document) {
      return {
        mediaId: document.file_id,
        fileName: document.file_name,
        fileSize: document.file_size,
        mimeType: document.mime_type,
        caption: message.caption,
        text: message.caption || (message.sticker?.emoji ? `Sticker ${message.sticker.emoji}` : undefined),
      };
    }

    if (message.location) {
      return {
        latitude: message.location.latitude,
        longitude: message.location.longitude,
      };
    }

    return { text: '[Unsupported Telegram message]' };
  }

  private senderName(from: Record<string, any>): string | undefined {
    const parts = [from.first_name, from.last_name].filter(Boolean);
    if (parts.length) return parts.join(' ');
    return from.username || from.title;
  }

  private extractTelegramMessageId(externalMessageId: string): number | undefined {
    const raw = externalMessageId.split(':').pop();
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
