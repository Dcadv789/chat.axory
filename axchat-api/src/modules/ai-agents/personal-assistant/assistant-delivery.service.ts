import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  MessageContentType,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

/**
 * Entrega uma mensagem do ASSISTENTE pro dono, na conversa dele: persiste,
 * emite realtime (in-app) e enfileira no outbound (Telegram/etc se houver
 * externalId). Reusado por lembretes e briefing diário.
 */
@Injectable()
export class AssistantDeliveryService {
  private readonly logger = new Logger(AssistantDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue('outbound-messages') private readonly outboundQueue: Queue,
  ) {}

  async deliver(
    organizationId: string,
    userId: string,
    text: string,
    metadata: Record<string, unknown> = {},
  ): Promise<boolean> {
    const cfg = await this.prisma.personalAssistantConfig.findUnique({
      where: { uq_assistant_org_user: { organizationId, userId } },
      select: { channelId: true, agentId: true },
    });
    if (!cfg?.channelId) return false;

    const conversation = await this.prisma.conversation.findFirst({
      where: { channelId: cfg.channelId, deletedAt: null },
      select: { id: true, contactId: true },
    });
    if (!conversation) return false;

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        type: MessageContentType.TEXT,
        content: { text },
        status: MessageStatus.QUEUED,
        senderName: 'Assistente',
        metadata: { aiAgentId: cfg.agentId, ...metadata },
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    this.realtime.emitToConversation(conversation.id, 'message:new', { message });
    this.realtime.emitToChannel(cfg.channelId, 'message:new', {
      message,
      conversationId: conversation.id,
    });

    const contactChannel = await this.prisma.contactChannel.findFirst({
      where: { contactId: conversation.contactId, channelId: cfg.channelId },
      select: { externalId: true },
    });
    if (contactChannel?.externalId) {
      await this.outboundQueue.add(
        'send-outbound',
        {
          messageId: message.id,
          channelId: cfg.channelId,
          contactExternalId: contactChannel.externalId,
          message: { type: MessageContentType.TEXT, content: { text } },
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true },
      );
    }
    return true;
  }
}
