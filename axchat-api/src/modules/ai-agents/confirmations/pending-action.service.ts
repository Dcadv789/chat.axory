import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import type {
  CreatePendingActionInput,
  PendingAction,
  PendingActionStatus,
} from './confirmation.types';
import { PendingActionStorage } from './pending-action.storage';
import { PENDING_ACTION_EXECUTOR_QUEUE } from './queue-names';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Service that owns the lifecycle of `PendingAction` records.
 *
 * Phase 1: pure CRUD + approve/reject + expiration check.
 * Phase 2: on `approve()` enqueue the actual tool execution (the args
 * are stored verbatim on the record).
 */
@Injectable()
export class PendingActionService {
  private readonly logger = new Logger(PendingActionService.name);
  private readonly DEFAULT_TTL_MIN = 30;

  constructor(
    private readonly storage: PendingActionStorage,
    @InjectQueue(PENDING_ACTION_EXECUTOR_QUEUE)
    private readonly executorQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Quando uma ação gated de MARKETING termina sem executar (rejeitada/expirada),
   * grava a linha terminal no log de negócio (marketing_activities) — senão o log
   * mostraria PENDING_APPROVAL pra sempre. Fire-and-forget, scoped por org.
   */
  private async logMarketingTerminal(
    action: PendingAction,
    terminal: 'REJECTED' | 'EXPIRED',
  ): Promise<void> {
    try {
      const agent = await this.prisma.aiAgent.findUnique({
        where: { id: action.agentId },
        select: { organizationId: true },
      });
      if (!agent) return;
      const skill = await this.prisma.aiSkill.findFirst({
        where: {
          organizationId: agent.organizationId,
          name: action.toolName,
          deletedAt: null,
        },
        select: { category: true },
      });
      if (!skill?.category?.startsWith('Marketing/')) return;
      await this.prisma.marketingActivity.create({
        data: {
          organizationId: agent.organizationId,
          agentId: action.agentId,
          runId: action.agentRunId,
          action: action.toolName,
          status: 'FAILED',
          title: `${action.toolName} ${terminal === 'REJECTED' ? 'rejeitada' : 'expirada'}`,
          payload: {
            pendingActionId: action.id,
            terminal,
            reason: (action as any).rejectedReason ?? null,
          },
        },
      });
    } catch (e: any) {
      this.logger.warn(
        `logMarketingTerminal(${action.toolName}) falhou: ${e?.message ?? e}`,
      );
    }
  }

  /** Create a new PENDING action for human review. */
  async create(input: CreatePendingActionInput): Promise<PendingAction> {
    const now = new Date();
    const ttlMin = input.ttlMinutes ?? this.DEFAULT_TTL_MIN;
    const expiresAt = new Date(now.getTime() + ttlMin * 60 * 1000);

    const action: PendingAction = {
      id: randomUUID(),
      agentRunId: input.agentRunId,
      conversationId: input.conversationId,
      agentId: input.agentId,
      toolName: input.toolName,
      args: input.args,
      preview: input.preview,
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.storage.save(action);

    this.logger.log({
      msg: 'pending_action_created',
      id: action.id,
      toolName: action.toolName,
      impact: action.preview.impact,
      conversationId: action.conversationId,
      expiresAt: action.expiresAt,
    });

    return action;
  }

  /**
   * Approve a pending action. If it has already expired in storage,
   * the status is moved to EXPIRED and the call fails.
   *
   * Phase 2 TODO: enqueue the actual execution of `action.toolName`
   * with `action.args` and persist `executionResult` once it runs.
   */
  async approve(
    id: string,
    userId: string,
    organizationId: string,
  ): Promise<PendingAction> {
    const action = await this.storage.get(id);
    if (!action) throw new NotFoundException('Pending action not found');
    await this.assertActionOrg(action, organizationId);

    if (action.status !== 'PENDING') {
      throw new BadRequestException(
        `Action is ${action.status} and cannot be approved`,
      );
    }

    if (this.isExpired(action)) {
      const previous = action.status;
      action.status = 'EXPIRED';
      await this.storage.save(action, previous);
      await this.logMarketingTerminal(action, 'EXPIRED');
      throw new BadRequestException('Action expired');
    }

    const previous = action.status;
    action.status = 'APPROVED';
    action.approvedBy = userId;
    action.approvedAt = new Date().toISOString();
    await this.storage.save(action, previous);

    this.logger.log({
      msg: 'pending_action_approved',
      id,
      userId,
      toolName: action.toolName,
    });

    // Fase 2.5: enfileira execução real da tool. O processor
    // (PendingActionExecutorProcessor) resolve built-in vs HTTP skill,
    // executa com bypassPendingGate, salva executionResult e marca EXECUTED.
    try {
      await this.executorQueue.add(
        'execute_pending',
        { pendingActionId: id },
        { removeOnComplete: 100, removeOnFail: 50 },
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to enqueue executor for pending action ${id}: ${err?.message ?? err}`,
      );
      // Não rethrow — aprovação foi salva. Operador pode re-disparar via UI.
    }

    return action;
  }

  /**
   * Reject a pending action with a human-readable reason.
   */
  async reject(
    id: string,
    userId: string,
    reason: string,
    organizationId: string,
  ): Promise<PendingAction> {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const action = await this.storage.get(id);
    if (!action) throw new NotFoundException('Pending action not found');
    await this.assertActionOrg(action, organizationId);

    if (action.status !== 'PENDING') {
      throw new BadRequestException(
        `Action is ${action.status} and cannot be rejected`,
      );
    }

    if (this.isExpired(action)) {
      const previous = action.status;
      action.status = 'EXPIRED';
      await this.storage.save(action, previous);
      await this.logMarketingTerminal(action, 'EXPIRED');
      throw new BadRequestException('Action expired');
    }

    const previous = action.status;
    action.status = 'REJECTED';
    action.rejectedBy = userId;
    action.rejectedAt = new Date().toISOString();
    action.rejectedReason = reason.trim();
    await this.storage.save(action, previous);

    // transferToHuman pausa a IA na hora (na chamada da tool). Rejeitar a
    // transferência significa "a IA deve continuar" — limpa o override pra ela
    // voltar a seguir as regras globais.
    if (action.toolName === 'transferToHuman') {
      await this.prisma.conversation
        .update({
          where: { id: action.conversationId },
          data: { aiEnabled: null, aiDisabledBy: null, aiDisabledAt: null },
        })
        .catch((e: any) =>
          this.logger.warn(
            `reject: falha ao reativar IA na conv ${action.conversationId}: ${e?.message ?? e}`,
          ),
        );
    }

    this.logger.log({
      msg: 'pending_action_rejected',
      id,
      userId,
      toolName: action.toolName,
    });

    await this.logMarketingTerminal(action, 'REJECTED');

    return action;
  }

  /** List PENDING actions da org, opcionalmente filtradas por conversa. */
  async listPending(
    organizationId: string,
    conversationId?: string,
  ): Promise<PendingAction[]> {
    return this.storage.listByStatus('PENDING', conversationId, organizationId);
  }

  /**
   * Garante que a ação pertence à org do request. Usa NotFound (e não Forbidden)
   * pra não revelar a existência de ações de outras orgs.
   */
  private async assertActionOrg(
    action: PendingAction,
    organizationId: string,
  ): Promise<void> {
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: action.agentId },
      select: { organizationId: true },
    });
    if (!agent || agent.organizationId !== organizationId) {
      throw new NotFoundException('Pending action not found');
    }
  }

  /** List actions for a given status. */
  async listByStatus(
    status: PendingActionStatus,
    conversationId?: string,
  ): Promise<PendingAction[]> {
    return this.storage.listByStatus(status, conversationId);
  }

  /** List every action (any status) for a conversation. */
  async listForConversation(conversationId: string): Promise<PendingAction[]> {
    return this.storage.listByConversation(conversationId);
  }

  async get(
    id: string,
    organizationId: string,
  ): Promise<PendingAction | null> {
    const action = await this.storage.get(id);
    if (!action) return null;
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: action.agentId },
      select: { organizationId: true },
    });
    if (!agent || agent.organizationId !== organizationId) return null;
    return action;
  }

  /**
   * Check & sweep expirations.
   *
   * Walks every PENDING action, marks expired ones as EXPIRED, returns
   * the count moved. Cron-friendly (idempotent). Phase 2 will wire this
   * to a `@Cron('* * * * *')` runner.
   */
  async expireOverdue(): Promise<number> {
    const pending = await this.storage.listByStatus('PENDING');
    let moved = 0;
    for (const action of pending) {
      if (this.isExpired(action)) {
        const previous = action.status;
        action.status = 'EXPIRED';
        await this.storage.save(action, previous);
        moved++;
        this.logger.log({
          msg: 'pending_action_expired',
          id: action.id,
          toolName: action.toolName,
        });
        await this.logMarketingTerminal(action, 'EXPIRED');
      }
    }
    return moved;
  }

  private isExpired(action: PendingAction): boolean {
    return new Date(action.expiresAt).getTime() < Date.now();
  }
}
