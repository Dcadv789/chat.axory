import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, ConversationStatus, MessageDirection } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { IdempotencyService } from './idempotency.service';

export interface ResolvedConversation {
  conversationId: string;
  status: ConversationStatus;
  isNew: boolean;
  wasReopened: boolean;
}

const OPEN_STATES = [
  ConversationStatus.PENDING,
  ConversationStatus.OPEN,
  ConversationStatus.BOT,
  ConversationStatus.WAITING,
] as const;

// WhatsApp Official só aceita texto livre dentro de 24h da última mensagem
// do cliente. Passado isso, a conversa é considerada encerrada — uma nova
// mensagem abre uma conversa nova em vez de reusar a antiga.
const ENGAGEMENT_WINDOW_HOURS = 24;

@Injectable()
export class ConversationResolverService {
  private readonly logger = new Logger(ConversationResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async resolve(
    organizationId: string,
    channelId: string,
    contactId: string,
    isGroup?: boolean,
    channelType?: ChannelType,
  ): Promise<ResolvedConversation> {
    // Fast path without lock — most webhooks hit an already-open conversation.
    const fast = await this.findOpen(organizationId, channelId, contactId);
    if (fast && !(await this.shouldRotate(channelType, fast.id))) {
      return this.touchOpen(fast, isGroup);
    }

    // Need to create, reopen, or rotate — serialise to prevent duplicates.
    return this.idempotency.withLock(
      `conv:${channelId}:${contactId}`,
      async () => {
        const existing = await this.findOpen(organizationId, channelId, contactId);
        if (existing) {
          // WhatsApp Official: janela de 24h expirou → fecha a antiga e abre
          // uma conversa nova (não reaproveita a mesma).
          if (await this.shouldRotate(channelType, existing.id)) {
            await this.closeForExpiredWindow(existing.id, existing.status);
          } else {
            return this.touchOpen(existing, isGroup);
          }
        } else {
          const lastClosed = await this.prisma.conversation.findFirst({
            where: {
              organizationId,
              channelId,
              contactId,
              status: ConversationStatus.CLOSED,
            },
            orderBy: { closedAt: 'desc' },
          });

          if (lastClosed) {
            const closedAt = lastClosed.closedAt || lastClosed.updatedAt;
            const hoursSinceClosed =
              (Date.now() - closedAt.getTime()) / (1000 * 60 * 60);
            // Não reabre numa janela já expirada — nesse caso cria conversa nova.
            const windowExpired = await this.shouldRotate(
              channelType,
              lastClosed.id,
            );
            if (hoursSinceClosed < 24 && !windowExpired) {
              await this.prisma.conversation.update({
                where: { id: lastClosed.id },
                data: {
                  status: ConversationStatus.PENDING,
                  closedAt: null,
                  assignedToId: null,
                },
              });
              await this.prisma.conversationAuditLog.create({
                data: {
                  conversationId: lastClosed.id,
                  action: 'REOPENED',
                  fromValue: ConversationStatus.CLOSED,
                  toValue: ConversationStatus.PENDING,
                  metadata: { trigger: 'new_inbound_message' },
                },
              });
              this.logger.log(`Conversation reopened: ${lastClosed.id}`);
              return {
                conversationId: lastClosed.id,
                status: ConversationStatus.PENDING,
                isNew: false,
                wasReopened: true,
              };
            }
          }
        }

        return this.createNew(organizationId, channelId, contactId, isGroup);
      },
    );
  }

  /**
   * WhatsApp Official só aceita texto livre dentro de 24h da última mensagem
   * do cliente. Passado isso, a conversa aberta deve ser encerrada e uma nova
   * criada quando o cliente voltar a escrever. Outros canais não têm essa
   * regra — sempre reaproveitam a conversa aberta.
   */
  private async shouldRotate(
    channelType: ChannelType | undefined,
    conversationId: string,
  ): Promise<boolean> {
    if (channelType !== ChannelType.WHATSAPP_OFFICIAL) return false;
    return this.isEngagementWindowExpired(conversationId);
  }

  private async isEngagementWindowExpired(
    conversationId: string,
  ): Promise<boolean> {
    const lastInbound = await this.prisma.message.findFirst({
      where: { conversationId, direction: MessageDirection.INBOUND },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!lastInbound) return false;
    const ageHours =
      (Date.now() - lastInbound.createdAt.getTime()) / (1000 * 60 * 60);
    return ageHours >= ENGAGEMENT_WINDOW_HOURS;
  }

  private async closeForExpiredWindow(
    conversationId: string,
    fromStatus: ConversationStatus,
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.CLOSED, closedAt: new Date() },
    });
    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId,
        action: 'STATUS_CHANGED',
        fromValue: fromStatus,
        toValue: ConversationStatus.CLOSED,
        metadata: { trigger: 'engagement_window_expired' },
      },
    });
    this.logger.log(
      `Conversation closed (24h window expired): ${conversationId}`,
    );
  }

  private async createNew(
    organizationId: string,
    channelId: string,
    contactId: string,
    isGroup?: boolean,
  ): Promise<ResolvedConversation> {
    const protocol = this.generateProtocol();
    const conversation = await this.prisma.conversation.create({
      data: {
        organizationId,
        channelId,
        contactId,
        status: ConversationStatus.PENDING,
        protocol,
        isGroup: isGroup || false,
      },
    });
    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId: conversation.id,
        action: 'CREATED',
        toValue: ConversationStatus.PENDING,
      },
    });
    this.logger.log(
      `New conversation created: ${conversation.id} (protocol: ${protocol})`,
    );
    return {
      conversationId: conversation.id,
      status: ConversationStatus.PENDING,
      isNew: true,
      wasReopened: false,
    };
  }

  private async findOpen(
    organizationId: string,
    channelId: string,
    contactId: string,
  ) {
    return this.prisma.conversation.findFirst({
      where: {
        organizationId,
        channelId,
        contactId,
        status: { in: Array.from(OPEN_STATES) },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async touchOpen(
    openConversation: {
      id: string;
      status: ConversationStatus;
      isGroup: boolean;
    },
    isGroup?: boolean,
  ): Promise<ResolvedConversation> {
    if (isGroup && !openConversation.isGroup) {
      await this.prisma.conversation.update({
        where: { id: openConversation.id },
        data: { isGroup: true },
      });
    }

    if (openConversation.status === ConversationStatus.WAITING) {
      await this.prisma.conversation.update({
        where: { id: openConversation.id },
        data: { status: ConversationStatus.OPEN },
      });
      await this.prisma.conversationAuditLog.create({
        data: {
          conversationId: openConversation.id,
          action: 'STATUS_CHANGED',
          fromValue: ConversationStatus.WAITING,
          toValue: ConversationStatus.OPEN,
          metadata: { trigger: 'customer_replied' },
        },
      });
      return {
        conversationId: openConversation.id,
        status: ConversationStatus.OPEN,
        isNew: false,
        wasReopened: false,
      };
    }

    return {
      conversationId: openConversation.id,
      status: openConversation.status,
      isNew: false,
      wasReopened: false,
    };
  }

  private generateProtocol(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${date}-${rand}`;
  }
}
