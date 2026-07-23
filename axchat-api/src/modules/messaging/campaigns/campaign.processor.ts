import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { MessageContentType, MessageDirection, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

interface RunJob {
  campaignId: string;
}

/** Espaçamento (ms) entre disparos por canal — respeita o ritmo do provider. */
const SPACING_MS: Record<string, number> = {
  WHATSAPP_ZAPPFY: 2500,
  WHATSAPP_OFFICIAL: 250,
  INSTAGRAM: 400,
  TELEGRAM: 120,
};

@Processor('campaigns', { concurrency: 2 })
export class CampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('outbound-messages') private readonly outbound: Queue,
  ) {
    super();
  }

  async process(job: Job<RunJob>): Promise<void> {
    const { campaignId } = job.data;
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status === 'CANCELED') return;

    const channel = await this.prisma.channel.findUnique({ where: { id: campaign.channelId } });
    if (!channel) {
      await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'FAILED', completedAt: new Date() } });
      return;
    }

    const spacing = SPACING_MS[channel.type] ?? 500;
    const isWhatsApp = channel.type === 'WHATSAPP_OFFICIAL' || channel.type === 'WHATSAPP_ZAPPFY';
    const content = (campaign.content ?? {}) as Record<string, any>;

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { campaignId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    let i = 0;

    for (const r of recipients) {
      // Se a campanha foi cancelada no meio, para de despachar.
      const fresh = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (fresh?.status === 'CANCELED') break;

      try {
        const externalId = await this.resolveExternalId(channel.id, r.contactId, channel.type, isWhatsApp, r.externalId);
        if (!externalId) {
          await this.markRecipient(r.id, 'FAILED', 'Contato sem número/identificador para este canal');
          failed++;
          continue;
        }

        const conversationId = await this.ensureConversation(campaign.organizationId, channel.id, r.contactId);
        const { type, msgContent } = this.buildMessage(campaign.messageType, content, r.name);

        const message = await this.prisma.message.create({
          data: {
            conversationId,
            direction: MessageDirection.OUTBOUND,
            type,
            content: msgContent,
            status: MessageStatus.QUEUED,
            senderName: `Campanha: ${campaign.name}`,
          },
          select: { id: true },
        });

        await this.outbound.add(
          'send-outbound',
          {
            messageId: message.id,
            channelId: channel.id,
            contactExternalId: externalId,
            message: { type, content: msgContent },
          },
          {
            delay: i * spacing,
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        await this.markRecipient(r.id, 'SENT', null, message.id);
        sent++;
        i++;
      } catch (err: any) {
        await this.markRecipient(r.id, 'FAILED', err?.message ?? 'erro ao despachar');
        failed++;
      }
    }

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'COMPLETED',
        sentCount: sent,
        failedCount: failed,
        completedAt: new Date(),
      },
    });
    this.logger.log(`Campanha ${campaignId} concluída: ${sent} despachados, ${failed} falhas.`);
  }

  /** Resolve o id do contato no canal; cria o ContactChannel a partir do phone (WhatsApp). */
  private async resolveExternalId(
    channelId: string,
    contactId: string,
    channelType: string,
    isWhatsApp: boolean,
    snapshotPhone: string | null,
  ): Promise<string | null> {
    const cc = await this.prisma.contactChannel.findFirst({
      where: { channelId, contactId },
      select: { externalId: true },
    });
    if (cc?.externalId) return cc.externalId;

    // WhatsApp: dá pra montar o externalId a partir do telefone (lista fria).
    if (isWhatsApp) {
      const phone = (snapshotPhone ?? '').replace(/\D/g, '');
      if (phone.length >= 8) {
        try {
          await this.prisma.contactChannel.create({
            data: { channelId, contactId, externalId: phone },
          });
        } catch {
          /* corrida — outro já criou; segue com o phone */
        }
        return phone;
      }
    }
    return null;
  }

  private async ensureConversation(organizationId: string, channelId: string, contactId: string): Promise<string> {
    const existing = await this.prisma.conversation.findFirst({
      where: { organizationId, channelId, contactId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.conversation.create({
      data: { organizationId, channelId, contactId, status: 'OPEN' },
      select: { id: true },
    });
    return created.id;
  }

  /** Monta o par (type, content) da Message, personalizando {{nome}}. */
  private buildMessage(messageType: string, content: Record<string, any>, contactName: string | null) {
    const nome = (contactName ?? '').trim();
    const sub = (s: string) => s.replace(/\{\{\s*nome\s*\}\}/gi, nome).replace(/\{\{\s*name\s*\}\}/gi, nome);

    if (messageType === 'TEMPLATE') {
      const params: string[] = Array.isArray(content.bodyParams) ? content.bodyParams : [];
      const components = params.length
        ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: sub(String(p)) })) }]
        : [];
      return {
        type: MessageContentType.TEMPLATE,
        msgContent: {
          name: content.templateName,
          language: { code: content.language || 'pt_BR' },
          ...(components.length ? { components } : {}),
        },
      };
    }
    return { type: MessageContentType.TEXT, msgContent: { text: sub(String(content.text ?? '')) } };
  }

  private async markRecipient(id: string, status: 'SENT' | 'FAILED', error: string | null, messageId?: string) {
    await this.prisma.campaignRecipient.update({
      where: { id },
      data: {
        status: status as any,
        error,
        ...(messageId ? { messageId } : {}),
        ...(status === 'SENT' ? { sentAt: new Date() } : {}),
      },
    });
  }
}
