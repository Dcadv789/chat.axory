import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AutomationTrigger, Conversation, ConversationStatus } from '@prisma/client';
import { OutboxService } from '../../automations/outbox/outbox.service';
import { ConversationsRepository, InboxFilters } from './conversations.repository';
import { agentCanSeeConversation } from './conversation-visibility.util';
import { ConversationFsmService } from './conversation-fsm.service';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { PrismaService } from '../../../database/prisma.service';
import { ChannelAdapterRegistry } from '../../channel-hub/channel-adapter.registry';
import { HistoryImportService } from '../pipeline/history-import.service';
import {
  ChannelAccess,
  ChannelAccessService,
} from '../../iam/channel-access/channel-access.service';
import { AgentRouterService } from '../../ai-agents/router/agent-router.service';
import { AiAgentRunnerService } from '../../ai-agents/runner/agent-runner.service';
import { syncNotSupportedMessage } from '../../channel-hub/sync/sync-messages.util';

const SYNC_MESSAGE_PAGE_SIZE = 50;
const SYNC_MAX_PAGES = 4;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly repository: ConversationsRepository,
    private readonly fsm: ConversationFsmService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: ChannelAdapterRegistry,
    private readonly historyImporter: HistoryImportService,
    private readonly channelAccess: ChannelAccessService,
    private readonly agentRouter: AgentRouterService,
    private readonly agentRunner: AiAgentRunnerService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Setores (Department) ativos do atendente, usados pra escopar a fila do
   * inbox por setor. Vazio = atendente sem setor (vê só as próprias + as sem
   * setor). OWNER/ADMIN não chamam isto (veem tudo).
   */
  private async getAgentDepartmentIds(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.departmentAgent.findMany({
      where: {
        isActive: true,
        department: { organizationId, deletedAt: null },
        userOrganization: { userId, organizationId },
      },
      select: { departmentId: true },
    });
    return rows.map((r) => r.departmentId);
  }

  private broadcastUpdate(conversation: Conversation | null): void {
    if (!conversation) return;
    this.realtimeGateway.emitToChannel(
      conversation.channelId,
      'conversation:updated',
      { conversation },
    );
    this.realtimeGateway.emitToConversation(
      conversation.id,
      'conversation:updated',
      { conversation },
    );
  }

  async findInbox(
    organizationId: string,
    filters: {
      status?: string;
      channelId?: string;
      channelIds?: string[];
      conversationIds?: string[];
      kind?: 'INDIVIDUAL' | 'GROUP';
      tagIds?: string[];
      assignedToId?: string;
      search?: string;
      archived?: 'exclude' | 'only' | 'any';
      unreadOnly?: boolean;
      stuckOnly?: boolean;
    },
    page: number,
    limit: number,
    access: ChannelAccess = 'ALL',
    currentUserId?: string,
    currentUserRole?: string,
  ) {
    const validStatuses = new Set(Object.values(ConversationStatus));
    const parsedStatuses = filters.status
      ?.split(',')
      .map((s) => s.trim() as ConversationStatus)
      .filter((s) => validStatuses.has(s));

    const inboxFilters: InboxFilters = {
      organizationId,
      status: parsedStatuses?.length ? parsedStatuses : undefined,
      channelId: filters.channelId,
      channelIds: filters.channelIds,
      conversationIds: filters.conversationIds,
      kind: filters.kind,
      tagIds: filters.tagIds,
      assignedToId: filters.assignedToId,
      search: filters.search,
      accessibleChannelIds: access === 'ALL' ? undefined : [...access],
      archived: filters.archived,
      unreadOnly: filters.unreadOnly,
      stuckOnly: filters.stuckOnly,
      // Visibilidade por atribuição + setor: AGENT só vê o que está atribuído a
      // ele OU a fila sem dono do(s) seu(s) setor(es) (+ as sem setor).
      // OWNER/ADMIN (gerência) veem tudo.
      restrictToAssigneeOrUnassigned:
        currentUserRole === 'AGENT' ? true : false,
      myDepartmentIds:
        currentUserRole === 'AGENT' && currentUserId
          ? await this.getAgentDepartmentIds(currentUserId, organizationId)
          : undefined,
    };

    const skip = (page - 1) * limit;
    const { conversations, total } = await this.repository.findInbox(
      inboxFilters,
      skip,
      limit,
      currentUserId,
    );

    return {
      conversations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(
    id: string,
    organizationId: string,
    access: ChannelAccess = 'ALL',
    currentUserId?: string,
    currentUserRole?: string,
  ) {
    const conversation = await this.repository.findById(id);
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.organizationId !== organizationId) {
      throw new ForbiddenException();
    }
    this.channelAccess.assertChannelAccess(access, conversation.channelId);

    // Visibilidade por atribuição + setor: AGENT só abre conversa atribuída a
    // ele OU na fila sem dono do(s) seu(s) setor(es) (+ sem setor). Mesma regra
    // da lista do inbox — fecha o vazamento de conteúdo entre setores via id.
    // OWNER/ADMIN (sem role nas chamadas internas) não entram aqui.
    if (currentUserRole === 'AGENT' && currentUserId) {
      const deptIds = await this.getAgentDepartmentIds(
        currentUserId,
        organizationId,
      );
      if (!agentCanSeeConversation(conversation, currentUserId, deptIds)) {
        throw new ForbiddenException(
          'Conversa fora do seu escopo de atendimento.',
        );
      }
    }
    return conversation;
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateConversationDto,
    actorId: string,
    access: ChannelAccess = 'ALL',
    actorRole?: string,
  ) {
    const conversation = await this.findOne(id, organizationId, access, actorId, actorRole);

    if (dto.assignedToId) {
      // Valida que o alvo é membro DESTA org — connect/assign por id cru não
      // valida tenant; sem isso dá pra atribuir a um usuário de outra org.
      const member = await this.prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: dto.assignedToId,
            organizationId,
          },
        },
        select: { userId: true },
      });
      if (!member) {
        throw new BadRequestException(
          'Usuário não pertence a esta organização',
        );
      }
      await this.fsm.assign(id, dto.assignedToId, actorId);
    }

    if (dto.status && dto.status !== conversation.status) {
      await this.fsm.transition(id, dto.status, actorId);
    }

    if (dto.departmentId) {
      // Valida que o setor é DESTA org — senão a conversa poderia ser apontada
      // pra um Department de outra org e sumir de todas as filas locais.
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!dept) {
        throw new NotFoundException('Setor não encontrado');
      }
      await this.repository.update(id, { department: { connect: { id: dto.departmentId } } });
    }

    if (dto.subject !== undefined) {
      const trimmed = dto.subject.trim();
      await this.repository.update(id, {
        subject: trimmed.length > 0 ? trimmed : null,
      });
    }

    const updated = await this.repository.findById(id);
    this.broadcastUpdate(updated as Conversation | null);
    return updated;
  }

  /**
   * Transfere a conversa para outro setor (Department), devolvendo-a à FILA do
   * setor de destino: zera o dono (`assignedToId=null`) e marca `PENDING`, de
   * modo que todos os atendentes daquele setor a vejam até alguém pegar (vira
   * dono ao responder). Liberado a qualquer atendente (AGENT+).
   */
  async transferToDepartment(
    id: string,
    organizationId: string,
    departmentId: string,
    actorId: string,
    access: ChannelAccess = 'ALL',
    actorRole?: string,
  ) {
    const conversation = await this.findOne(
      id,
      organizationId,
      access,
      actorId,
      actorRole,
    );

    const dept = await this.prisma.department.findFirst({
      where: { id: departmentId, organizationId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!dept) throw new NotFoundException('Setor não encontrado');

    // Update + audit numa transação só — se o audit falhar, a transferência
    // não fica sem rastro (e vice-versa).
    const [updated] = await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id },
        data: {
          departmentId: dept.id,
          assignedToId: null,
          status: ConversationStatus.PENDING,
        },
      }),
      this.prisma.conversationAuditLog.create({
        data: {
          conversationId: id,
          actorId,
          action: 'DEPARTMENT_TRANSFERRED',
          fromValue: conversation.departmentId ?? null,
          toValue: dept.id,
          metadata: { departmentName: dept.name },
        },
      }),
    ]);

    this.broadcastUpdate(updated as Conversation);

    // Dispara automações de mudança de status (a transferência seta PENDING
    // direto, sem passar pelo FSM que normalmente emite este evento).
    if (conversation.status !== ConversationStatus.PENDING) {
      await this.outbox
        .enqueuePostCommit(AutomationTrigger.CONVERSATION_STATUS_CHANGED, {
          organizationId,
          contactId: conversation.contactId,
          conversationId: id,
          channelId: conversation.channelId,
          actorId,
          fromStatus: conversation.status,
          toStatus: ConversationStatus.PENDING,
        })
        .catch((e: any) =>
          this.logger.warn(
            `outbox status-change (transfer) falhou conv ${id}: ${e?.message ?? e}`,
          ),
        );
    }

    return updated;
  }

  async toggleAi(
    id: string,
    organizationId: string,
    enabled: boolean | null,
    actorId: string,
    access: ChannelAccess = 'ALL',
    actorRole?: string,
  ) {
    await this.findOne(id, organizationId, access, actorId, actorRole);

    // Tri-state:
    //   null  = limpa override, conversa volta a seguir regras globais
    //   true  = força ON (sobrepõe kill switch e horário)
    //   false = força OFF
    const updated = await this.prisma.conversation.update({
      where: { id },
      data:
        enabled === null
          ? {
              aiEnabled: null,
              aiDisabledBy: null,
              aiDisabledAt: null,
            }
          : enabled === true
            ? {
                aiEnabled: true,
                aiDisabledBy: null,
                aiDisabledAt: null,
              }
            : {
                aiEnabled: false,
                aiDisabledBy: actorId,
                aiDisabledAt: new Date(),
                activeAgentId: null,
              },
    });

    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId: id,
        actorId,
        action:
          enabled === null
            ? 'AI_OVERRIDE_CLEARED'
            : enabled
              ? 'AI_FORCED_ON'
              : 'AI_FORCED_OFF',
        metadata: {},
      },
    });
    this.realtimeGateway.emitToConversation(id, 'conversation:ai-toggle', {
      conversationId: id,
      aiEnabled: enabled,
      actorId,
    });
    return updated;
  }

  /**
   * Manually trigger the AI agent to engage with this conversation right now.
   * Reads the latest inbound (or any latest message if no inbound) as the
   * trigger, calls the runner, and returns whatever final action the agent
   * decided. Skipped silently if the router rejects (paused, no agent, etc).
   */
  async engageAi(
    id: string,
    organizationId: string,
    actorId: string,
    access: ChannelAccess = 'ALL',
    actorRole?: string,
  ): Promise<{ engaged: boolean; reason?: string }> {
    const conversation = await this.findOne(
      id,
      organizationId,
      access,
      actorId,
      actorRole,
    );

    const decision = await this.agentRouter.shouldHandle(
      conversation as Conversation,
    );
    if (!decision.handle) {
      this.logger.log(
        `engageAi skipped for conv ${id}: ${decision.reason} (actor=${actorId})`,
      );
      return { engaged: false, reason: decision.reason };
    }

    // Pick the most recent inbound as the trigger so the agent has something
    // concrete to react to. Fall back to the latest message of any direction
    // (covers the case where the conversation was opened by the human).
    const triggerMessage =
      (await this.prisma.message.findFirst({
        where: { conversationId: id, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.message.findFirst({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
      }));

    if (!triggerMessage) {
      return { engaged: false, reason: 'no-messages' };
    }

    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId: id,
        actorId,
        action: 'AI_ENGAGED_MANUALLY',
        metadata: { triggerMessageId: triggerMessage.id },
      },
    });

    // Runner is async — kick it off in the background. The response payload
    // (new outbound message) will arrive via realtime + the run record will
    // appear in /ai-agents stats. Frontend can refetch right after the call.
    this.agentRunner
      .run({ conversation: conversation as Conversation, triggerMessage })
      .catch((err) =>
        this.logger.error(
          `engageAi run failed for conv ${id}: ${err?.message ?? err}`,
        ),
      );

    return { engaged: true };
  }

  /**
   * Manually pin a specific AI agent to this conversation and immediately
   * engage it. Use case: human says "vou te passar pra Lívia" via manual
   * message — the system can't infer that intent from text, so the operator
   * picks the agent in the UI and we (a) flip activeAgentId, (b) clear any
   * paused state (force AI on for this conversation), (c) fire the runner.
   */
  async setActiveAgent(
    id: string,
    organizationId: string,
    agentId: string,
    actorId: string,
    access: ChannelAccess = 'ALL',
    actorRole?: string,
  ): Promise<{ engaged: boolean; reason?: string; agentName?: string }> {
    const conversation = await this.findOne(
      id,
      organizationId,
      access,
      actorId,
      actorRole,
    );

    const agent = await this.prisma.aiAgent.findFirst({
      where: { id: agentId, organizationId, isActive: true, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found or not active in this org');
    }

    // Pin agent + force AI on for this conversation (override any pause).
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: {
        activeAgentId: agentId,
        aiEnabled: true,
        aiDisabledBy: null,
        aiDisabledAt: null,
      },
    });

    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId: id,
        actorId,
        action: 'AI_AGENT_SET',
        fromValue: conversation.activeAgentId,
        toValue: agentId,
        metadata: { agentName: agent.name },
      },
    });

    this.broadcastUpdate(updated as Conversation);
    this.realtimeGateway.emitToConversation(id, 'conversation:ai-toggle', {
      conversationId: id,
      aiEnabled: true,
      activeAgentId: agentId,
      reason: 'agent-pinned',
    });

    // Pick latest inbound (preferred) or fallback to any latest message.
    const triggerMessage =
      (await this.prisma.message.findFirst({
        where: { conversationId: id, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.message.findFirst({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
      }));

    if (!triggerMessage) {
      return {
        engaged: false,
        reason: 'no-messages',
        agentName: agent.name,
      };
    }

    this.agentRunner
      .run({
        conversation: updated as Conversation,
        triggerMessage,
      })
      .catch((err) =>
        this.logger.error(
          `setActiveAgent run failed for conv ${id}: ${err?.message ?? err}`,
        ),
      );

    return { engaged: true, agentName: agent.name };
  }

  async close(
    id: string,
    organizationId: string,
    actorId: string,
    access: ChannelAccess = 'ALL',
    actorRole?: string,
  ) {
    await this.findOne(id, organizationId, access, actorId, actorRole);
    await this.fsm.transition(id, ConversationStatus.CLOSED, actorId);
    const updated = await this.repository.findById(id);
    this.broadcastUpdate(updated as Conversation | null);
    return updated;
  }

  async reopen(
    id: string,
    organizationId: string,
    actorId: string,
    access: ChannelAccess = 'ALL',
    actorRole?: string,
  ) {
    const conversation = await this.findOne(
      id,
      organizationId,
      access,
      actorId,
      actorRole,
    );
    const target = conversation.assignedToId
      ? ConversationStatus.OPEN
      : ConversationStatus.PENDING;
    await this.fsm.transition(id, target, actorId);
    const updated = await this.repository.findById(id);
    this.broadcastUpdate(updated as Conversation | null);
    return updated;
  }

  /**
   * Hard delete — apaga a conversa de verdade. Cascade nas FKs (messages,
   * tags, audit logs, AI runs, reads, internal notes, rating, cards) cuida
   * dos dependentes. Operação irreversível: exige confirmação digitando o
   * nome ou telefone exato do contato.
   */
  async hardDelete(
    id: string,
    organizationId: string,
    access: ChannelAccess = 'ALL',
    confirm?: string,
    actorId?: string,
    actorRole?: string,
  ) {
    const conversation = await this.findOne(id, organizationId, access, actorId, actorRole);
    const expectedName = (conversation as any).contact?.name?.trim();
    const expectedPhone = (conversation as any).contact?.phone?.trim();
    const provided = (confirm ?? '').trim();
    if (!provided) {
      throw new BadRequestException(
        'Confirmação obrigatória: passe ?confirm=<nome ou telefone exato do contato>.',
      );
    }
    if (provided !== expectedName && provided !== expectedPhone) {
      throw new BadRequestException(
        'Confirmação não confere com o nome ou telefone do contato — apagamento abortado.',
      );
    }

    // FKs estão com onDelete: Cascade nos relacionados (messages,
    // conversation_tags, ai_agent_runs, conversation_reads, etc.) então
    // basta apagar a conversa que o resto cai junto.
    await this.prisma.conversation.delete({ where: { id } });

    this.realtimeGateway.emitToChannel(
      conversation.channelId,
      'conversation:deleted',
      { conversationId: id },
    );
    return { ok: true, id };
  }

  async setArchived(
    id: string,
    organizationId: string,
    archived: boolean,
    actorId: string,
    access: ChannelAccess = 'ALL',
    actorRole?: string,
  ) {
    await this.findOne(id, organizationId, access, actorId, actorRole);
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: archived
        ? { isArchived: true, archivedAt: new Date(), archivedById: actorId }
        : { isArchived: false, archivedAt: null, archivedById: null },
    });

    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId: id,
        actorId,
        action: archived ? 'CONVERSATION_ARCHIVED' : 'CONVERSATION_UNARCHIVED',
        metadata: {},
      },
    });

    this.broadcastUpdate(updated as Conversation);
    return updated;
  }

  async assignToMe(
    id: string,
    organizationId: string,
    userId: string,
    access: ChannelAccess = 'ALL',
    userRole?: string,
  ) {
    await this.findOne(id, organizationId, access, userId, userRole);
    await this.fsm.assign(id, userId, userId);
    const updated = await this.repository.findById(id);
    this.broadcastUpdate(updated as Conversation | null);
    return updated;
  }

  async getStatusCounts(
    organizationId: string,
    access: ChannelAccess = 'ALL',
    currentUserId?: string,
    currentUserRole?: string,
  ) {
    const accessibleIds = access === 'ALL' ? undefined : [...access];
    const myDepartmentIds =
      currentUserRole === 'AGENT' && currentUserId
        ? await this.getAgentDepartmentIds(currentUserId, organizationId)
        : undefined;
    return this.repository.countByStatus(
      organizationId,
      accessibleIds,
      currentUserRole === 'AGENT',
      currentUserId,
      myDepartmentIds,
    );
  }

  /**
   * Marks a conversation as read for the current user. Upserts the
   * ConversationRead row with lastReadAt = now and emits a realtime
   * `conversation:read` event so any open client (other tab, mobile)
   * zeros the badge in real time.
   */
  async markAsRead(
    conversationId: string,
    organizationId: string,
    userId: string,
    access: ChannelAccess = 'ALL',
    lastReadMessageId?: string,
    userRole?: string,
  ) {
    await this.findOne(conversationId, organizationId, access, userId, userRole);
    const read = await this.repository.markAsRead(
      userId,
      conversationId,
      lastReadMessageId,
    );

    this.realtimeGateway.emitToUser(userId, 'conversation:read', {
      conversationId,
      userId,
      lastReadAt: read.lastReadAt,
    });

    return { ok: true, lastReadAt: read.lastReadAt };
  }

  /**
   * Per-user "mark as unread". Pushes lastReadAt before the latest inbound so
   * the conversation re-surfaces as unread for THIS user only. Other users'
   * read state is untouched.
   */
  async markAsUnread(
    conversationId: string,
    organizationId: string,
    userId: string,
    access: ChannelAccess = 'ALL',
    userRole?: string,
  ) {
    await this.findOne(conversationId, organizationId, access, userId, userRole);
    const result = await this.repository.markAsUnread(userId, conversationId);

    this.realtimeGateway.emitToUser(userId, 'conversation:unread', {
      conversationId,
      userId,
      unreadCount: result.unreadCount,
    });

    return { ok: true, unreadCount: result.unreadCount };
  }

  /**
   * On-demand sync of a single conversation: pulls the latest messages from
   * the channel provider (e.g. Zappfy) and merges them with what we already
   * have locally. The webhook covers the steady state — this is the recovery
   * path for when an event was missed (provider downtime, webhook hiccup,
   * channel reconnected, etc.).
   */
  async syncMessages(
    id: string,
    organizationId: string,
    access: ChannelAccess = 'ALL',
    currentUserId?: string,
    currentUserRole?: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        channel: true,
        contact: {
          include: {
            channels: true,
          },
        },
      },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.organizationId !== organizationId) {
      throw new ForbiddenException();
    }
    this.channelAccess.assertChannelAccess(access, conversation.channelId);

    // Sincronizar puxa mensagens do provider — escopar por setor pro AGENT.
    if (currentUserRole === 'AGENT' && currentUserId) {
      const deptIds = await this.getAgentDepartmentIds(
        currentUserId,
        organizationId,
      );
      if (!agentCanSeeConversation(conversation, currentUserId, deptIds)) {
        throw new ForbiddenException(
          'Conversa fora do seu escopo de atendimento.',
        );
      }
    }

    const adapter = this.adapterRegistry.getHistorySync(conversation.channel.type);
    if (!adapter) {
      throw new BadRequestException(syncNotSupportedMessage(conversation.channel.type));
    }

    const externalId = this.resolveExternalConversationId(conversation);
    if (!externalId) {
      throw new BadRequestException(
        'Cannot sync: conversation has no external chat id',
      );
    }

    let cursor: string | undefined;
    let imported = 0;
    let fetched = 0;
    let pages = 0;

    try {
      do {
        const result = await adapter.fetchMessages(
          conversation.channel,
          externalId,
          {},
          cursor,
          SYNC_MESSAGE_PAGE_SIZE,
        );
        fetched += result.messages.length;
        if (result.messages.length === 0) break;

        const res = await this.historyImporter.importMessages(
          conversation.channel,
          conversation.id,
          result.messages,
        );
        imported += res.imported;
        cursor = result.nextCursor;
        pages++;

        // Stop early once we hit a page where everything was already known —
        // the provider returns newest-first, so older pages can only be older
        // than what we already imported.
        if (res.imported === 0) break;
      } while (cursor && pages < SYNC_MAX_PAGES);
    } catch (err: any) {
      this.logger.error(
        `Failed to sync conversation ${id}: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `Sync failed: ${err.response?.data?.message || err.message}`,
      );
    }

    if (imported > 0) {
      await this.historyImporter.notifyConversationImported(
        organizationId,
        conversation.id,
      );
    }

    this.logger.log(
      `Conversation ${id} synced: ${imported} new, ${fetched - imported} already known`,
    );

    return {
      imported,
      fetched,
      syncedAt: new Date().toISOString(),
    };
  }

  private resolveExternalConversationId(conversation: {
    channelId: string;
    metadata: any;
    contact: { channels: { channelId: string; externalId: string }[] };
  }): string | null {
    const fromMetadata =
      conversation.metadata &&
      typeof conversation.metadata === 'object' &&
      'externalConversationId' in conversation.metadata
        ? String((conversation.metadata as any).externalConversationId)
        : null;
    if (fromMetadata) return fromMetadata;

    const contactChannel = conversation.contact.channels.find(
      (c) => c.channelId === conversation.channelId,
    );
    return contactChannel?.externalId ?? null;
  }
}
