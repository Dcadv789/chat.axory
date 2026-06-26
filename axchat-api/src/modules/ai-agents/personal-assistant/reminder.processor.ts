import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import {
  MessageContentType,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { PERSONAL_REMINDER_QUEUE } from './reminder-scheduler.service';

/**
 * Dispara os lembretes pessoais vencidos: no horário (remindAt <= now), entrega
 * a notificação na conversa do dono com o assistente (mensagem do assistente),
 * pelo canal escolhido (interno = só in-app; Telegram/etc = via outbound).
 */
@Processor(PERSONAL_REMINDER_QUEUE, { concurrency: 2 })
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue('outbound-messages') private readonly outboundQueue: Queue,
  ) {
    super();
  }

  async process(_job: Job): Promise<{ sent: number }> {
    const now = new Date();
    const due = await this.prisma.personalReminder.findMany({
      where: { status: 'PENDING', remindAt: { lte: now } },
      take: 100,
      select: {
        id: true,
        organizationId: true,
        userId: true,
        message: true,
      },
    });
    if (due.length === 0) return { sent: 0 };

    let sent = 0;
    for (const r of due) {
      // Marca SENT antes de entregar (evita reenvio se o tick seguinte chegar).
      await this.prisma.personalReminder.update({
        where: { id: r.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      try {
        await this.deliver(r);
        sent++;
      } catch (err: any) {
        this.logger.error(`Falha ao entregar lembrete ${r.id}: ${err?.message ?? err}`);
      }
    }
    this.logger.log(`personal-reminder tick: ${sent}/${due.length} entregues`);
    return { sent };
  }

  private async deliver(r: {
    id: string;
    organizationId: string;
    userId: string;
    message: string;
  }): Promise<void> {
    const cfg = await this.prisma.personalAssistantConfig.findUnique({
      where: {
        uq_assistant_org_user: {
          organizationId: r.organizationId,
          userId: r.userId,
        },
      },
      select: { channelId: true, agentId: true },
    });
    if (!cfg?.channelId) {
      this.logger.warn(`Lembrete ${r.id}: assistente sem canal configurado`);
      return;
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { channelId: cfg.channelId, deletedAt: null },
      select: { id: true, contactId: true },
    });
    if (!conversation) {
      this.logger.warn(`Lembrete ${r.id}: conversa do assistente não encontrada`);
      return;
    }

    const text = `⏰ Lembrete: ${r.message}`;
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        type: MessageContentType.TEXT,
        content: { text },
        status: MessageStatus.QUEUED,
        senderName: 'Assistente',
        metadata: { personalReminderId: r.id, aiAgentId: cfg.agentId },
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // Realtime (in-app) — funciona pra canal interno e qualquer outro.
    this.realtime.emitToConversation(conversation.id, 'message:new', { message });
    this.realtime.emitToChannel(cfg.channelId, 'message:new', {
      message,
      conversationId: conversation.id,
    });

    // Entrega externa (Telegram etc): enfileira no outbound se houver externalId.
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
  }
}
