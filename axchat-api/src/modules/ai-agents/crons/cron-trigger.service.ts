import { Injectable, Logger } from '@nestjs/common';
import {
  AgentCron,
  ChannelType,
  ConversationStatus,
  MessageContentType,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AiAgentRunnerService } from '../runner/agent-runner.service';

const CRON_CHANNEL_NAME = 'Crons (Sistema)';
const CRON_CONTACT_EXTERNAL_ID = 'cron-system';

/**
 * Executa um AgentCron: provisiona (lazy) a infra de canal INTERNO da org,
 * injeta a `task` do cron como mensagem-gatilho numa conversa interna e roda
 * o agente pelo motor existente (AiAgentRunnerService). O canal INTERNAL tem
 * outbound no-op, então a resposta do agente persiste e fica visível como
 * thread interna — sem mandar nada pra fora.
 */
@Injectable()
export class CronTriggerService {
  private readonly logger = new Logger(CronTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AiAgentRunnerService,
  ) {}

  /** Dispara um cron por id. Atualiza lastRunAt/lastStatus/lastRunId/lastError. */
  async fire(cronId: string): Promise<void> {
    const cron = await this.prisma.agentCron.findFirst({
      where: { id: cronId, deletedAt: null },
      include: {
        agent: { select: { id: true, isActive: true, name: true, sector: true } },
      },
    });
    if (!cron) {
      this.logger.warn(`fire(${cronId}): cron não encontrado`);
      return;
    }
    if (!cron.agent || !cron.agent.isActive) {
      await this.markResult(cron.id, 'SKIPPED', 'Agente inativo ou removido.');
      return;
    }

    // Gate de plano: agente de marketing só roda se a org tem o add-on ligado.
    if (cron.agent.sector === 'MARKETING') {
      const org = await this.prisma.organization.findUnique({
        where: { id: cron.organizationId },
        select: { marketingEnabled: true },
      });
      if (!org?.marketingEnabled) {
        await this.markResult(
          cron.id,
          'SKIPPED',
          'Add-on de Marketing desativado para esta organização.',
        );
        return;
      }
    }

    try {
      const conversation = await this.ensureConversation(cron);

      const triggerMessage = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND,
          type: MessageContentType.TEXT,
          content: { text: `[CRON · ${cron.name}] ${cron.task}` },
          status: MessageStatus.DELIVERED,
          senderName: 'Cron',
          metadata: { cronId: cron.id, system: true },
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      // chainDepth=1 pula o roteador: o agente é resolvido por
      // conversation.activeAgentId (que setamos = cron.agentId).
      await this.runner.run({
        conversation,
        triggerMessage,
        chainDepth: 1,
      });

      const lastRun = await this.prisma.aiAgentRun.findFirst({
        where: { conversationId: conversation.id, agentId: cron.agentId },
        orderBy: { startedAt: 'desc' },
        select: { id: true, status: true },
      });

      await this.markResult(
        cron.id,
        lastRun?.status ?? 'COMPLETED',
        null,
        lastRun?.id ?? null,
      );
      this.logger.log(
        `cron "${cron.name}" disparado (agent=${cron.agent.name}, run=${lastRun?.id ?? 'n/a'})`,
      );
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      this.logger.error(`fire(${cronId}) falhou: ${msg}`);
      await this.markResult(cron.id, 'FAILED', msg.slice(0, 500));
    }
  }

  private async markResult(
    cronId: string,
    status: string,
    error: string | null,
    runId?: string | null,
  ): Promise<void> {
    await this.prisma.agentCron.update({
      where: { id: cronId },
      data: {
        lastRunAt: new Date(),
        lastStatus: status,
        lastError: error,
        ...(runId !== undefined ? { lastRunId: runId } : {}),
      },
    });
  }

  /** Conversa interna dedicada ao cron (uma por cron), reaproveitada a cada disparo. */
  private async ensureConversation(cron: AgentCron) {
    const channel = await this.ensureInternalChannel(cron.organizationId);
    const contact = await this.ensureSystemContact(
      cron.organizationId,
      channel.id,
    );

    if (cron.conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: cron.conversationId, deletedAt: null },
      });
      if (existing) {
        // Garante que o agente do cron é o ativo (caso o cron tenha sido editado).
        if (existing.activeAgentId !== cron.agentId || existing.aiEnabled !== true) {
          return this.prisma.conversation.update({
            where: { id: existing.id },
            data: { activeAgentId: cron.agentId, aiEnabled: true },
          });
        }
        return existing;
      }
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        organizationId: cron.organizationId,
        channelId: channel.id,
        contactId: contact.id,
        status: ConversationStatus.BOT,
        subject: `Cron · ${cron.name}`,
        aiEnabled: true,
        activeAgentId: cron.agentId,
        metadata: { cronId: cron.id },
      },
    });
    await this.prisma.agentCron.update({
      where: { id: cron.id },
      data: { conversationId: conversation.id },
    });
    return conversation;
  }

  private async ensureInternalChannel(organizationId: string) {
    const existing = await this.prisma.channel.findFirst({
      where: {
        organizationId,
        type: ChannelType.INTERNAL,
        name: CRON_CHANNEL_NAME,
        deletedAt: null,
      },
    });
    if (existing) return existing;

    return this.prisma.channel.create({
      data: {
        organizationId,
        type: ChannelType.INTERNAL,
        name: CRON_CHANNEL_NAME,
        config: { cronSystem: true },
        isActive: true,
        aiEnabled: true,
      },
    });
  }

  private async ensureSystemContact(organizationId: string, channelId: string) {
    const link = await this.prisma.contactChannel.findFirst({
      where: { channelId, externalId: CRON_CONTACT_EXTERNAL_ID },
      include: { contact: true },
    });
    if (link?.contact) return link.contact;

    return this.prisma.contact.create({
      data: {
        organizationId,
        name: 'Sistema (Cron)',
        metadata: { system: true, cron: true },
        channels: {
          create: {
            channelId,
            externalId: CRON_CONTACT_EXTERNAL_ID,
            profileName: 'Sistema (Cron)',
          },
        },
      },
    });
  }
}
