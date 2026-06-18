import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ChannelType, Channel } from '@prisma/client';
import { OutboundChannelPort, ResolveMediaHint } from '../../ports/outbound-channel.port';
import {
  NormalizedOutboundMessage,
  SendResult,
  RateLimitConfig,
  MessageContentType,
} from '../../ports/types';
import { WhatsAppOfficialMessageMapper } from './whatsapp-official.message-mapper';
import { WhatsAppOfficialHttpClient } from './whatsapp-official.http-client';
import { UploadsService } from '../../../messaging/messages/uploads.service';

@Injectable()
export class WhatsAppOfficialOutboundAdapter implements OutboundChannelPort {
  readonly channelType = ChannelType.WHATSAPP_OFFICIAL;
  private readonly logger = new Logger(WhatsAppOfficialOutboundAdapter.name);

  constructor(
    private readonly mapper: WhatsAppOfficialMessageMapper,
    private readonly httpClient: WhatsAppOfficialHttpClient,
    private readonly uploads: UploadsService,
  ) {}

  async sendMessage(
    channel: Channel,
    contactExternalId: string,
    message: NormalizedOutboundMessage,
  ): Promise<SendResult> {
    const prepared = await this.prepareOutboundMedia(channel, message);
    const payload = this.mapper.denormalize(prepared, contactExternalId);
    const response = await this.httpClient.sendMessage(channel, payload);

    return {
      externalId: response?.messages?.[0]?.id || '',
      providerResponse: response,
    };
  }

  /**
   * WhatsApp Cloud API accepts media via public `link`, but Meta's fetch is
   * flaky (firewall, timing, SSL). Upload the bytes directly and send by id.
   */
  private async prepareOutboundMedia(
    channel: Channel,
    message: NormalizedOutboundMessage,
  ): Promise<NormalizedOutboundMessage> {
    const mediaTypes = new Set<MessageContentType>([
      MessageContentType.AUDIO,
      MessageContentType.IMAGE,
      MessageContentType.VIDEO,
      MessageContentType.DOCUMENT,
      MessageContentType.STICKER,
    ]);
    if (!mediaTypes.has(message.type)) return message;

    const mediaUrl = message.content?.mediaUrl;
    if (!mediaUrl) return message;

    const file = await this.uploads.readByPublicUrl(
      mediaUrl,
      message.content?.mimeType,
    );

    let uploadBuffer = file.buffer;
    let uploadMime = file.mimeType;
    let uploadName = file.filename;

    if (message.type === MessageContentType.AUDIO) {
      if (uploadBuffer.byteLength < 500) {
        throw new BadRequestException('Audio file is too small to send');
      }
      if (file.localPath) {
        const prepared = await this.uploads.prepareWhatsAppOfficialAudioUpload(
          file.localPath,
        );
        uploadBuffer = prepared.buffer;
        uploadMime = prepared.mimeType;
        uploadName = prepared.filename;
      }
    }

    const mediaId = await this.httpClient.uploadMedia(
      channel,
      uploadBuffer,
      uploadMime,
      uploadName,
    );

    this.logger.log(
      `WA Official media uploaded: type=${message.type} id=${mediaId} bytes=${uploadBuffer.byteLength} mime=${uploadMime}`,
    );

    return {
      ...message,
      content: {
        ...message.content,
        mediaId,
      },
    };
  }

  async sendTypingIndicator(_channel: Channel, _contactExternalId: string): Promise<void> {
    // Meta Cloud API doesn't support typing indicators via API
  }

  async getMediaUrl(channel: Channel, mediaId: string): Promise<string> {
    return this.httpClient.getMediaUrl(channel, mediaId);
  }

  async downloadMedia(channel: Channel, mediaId: string): Promise<Buffer> {
    const url = await this.httpClient.getMediaUrl(channel, mediaId);
    return this.httpClient.downloadMedia(channel, url);
  }

  /**
   * Meta Cloud's media URL is a Graph CDN link that requires the WABA's
   * bearer token to GET — browsers cannot load it directly. We download
   * once with the token and re-host the bytes under our own
   * `/api/v1/uploads/inbound/...` so the frontend can render it like any
   * other static asset and the cached URL keeps working past Meta's
   * 5-minute signed-URL window.
   */
  async resolveInboundMediaUrl(
    channel: Channel,
    hint: ResolveMediaHint,
  ): Promise<{ fileUrl: string; mimeType?: string }> {
    if (!hint.mediaId) {
      throw new BadRequestException(
        'WhatsApp Official media resolution requires a stored mediaId',
      );
    }
    const buffer = await this.downloadMedia(channel, hint.mediaId);
    const saved = await this.uploads.saveInboundMedia({
      buffer,
      mimeType: hint.mimeType || 'application/octet-stream',
      channelId: channel.id,
      originalFilename: hint.originalFilename ?? null,
    });
    return { fileUrl: saved.url, mimeType: saved.mimeType };
  }

  /**
   * Meta Cloud API NÃO suporta delete de mensagem — não existe endpoint
   * público pra remover uma mensagem já enviada. Lançamos erro claro pra
   * que o service de delete capture e siga com soft-delete (marca como
   * revoked apenas no nosso lado, mas a mensagem permanece visível pro
   * cliente final no WhatsApp dele).
   */
  async deleteMessage(
    _channel: Channel,
    externalMessageId: string,
  ): Promise<void> {
    throw new Error(
      `WhatsApp Cloud API does not support message deletion (id=${externalMessageId}). ` +
        'Marcamos a mensagem como deletada apenas no AxChat — ' +
        'no app do cliente ela continua existindo (limitação da Meta).',
    );
  }

  getRateLimits(): RateLimitConfig {
    return {
      maxPerSecond: 80,
      maxPerMinute: 1000,
      windowMs: 60000,
    };
  }
}
