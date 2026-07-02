import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ConversationStatus,
  MessageContentType,
  MessageDirection,
  MessageStatus,
  Prisma,
} from '@prisma/client';
import type { Job } from 'bullmq';

import { PrismaService } from '../../../database/prisma.service';
import { HttpToolExecutorService } from '../tools/http-tool-executor.service';
import type { ToolContext } from '../tools/tool.types';
import { PendingActionStorage } from './pending-action.storage';
import {
  PENDING_ACTION_EXECUTOR_QUEUE,
  PENDING_EXPIRE_JOB,
} from './queue-names';

export {
  PENDING_ACTION_EXECUTOR_QUEUE,
  PENDING_EXECUTE_JOB,
  PENDING_EXPIRE_JOB,
} from './queue-names';

type ExecutorJobData =
  | { pendingActionId: string }
  | Record<string, never>;

/**
 * Fase 2.5: executor pós-aprovação.
 *
 * Quando o operador aprova um `AiPendingAction`, o `PendingActionService`
 * enfileira aqui. Esse worker:
 *   - resolve a tool original (built-in `transferToHuman` ou skill HTTP)
 *   - executa de fato (HTTP com `bypassPendingGate: true` pra evitar loop)
 *   - grava `executionResult` e marca status `EXECUTED`
 *
 * Falhas resultam em status PENDING + executionResult com error → operador
 * pode re-aprovar. Não bloqueia outras pendings.
 */
@Processor(PENDING_ACTION_EXECUTOR_QUEUE, { concurrency: 4 })
export class PendingActionExecutorProcessor extends WorkerHost {
  private readonly logger = new Logger(PendingActionExecutorProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpExecutor: HttpToolExecutorService,
    private readonly storage: PendingActionStorage,
  ) {
    super();
  }

  async process(job: Job<ExecutorJobData>): Promise<unknown> {
    if (job.name === PENDING_EXPIRE_JOB) {
      return this.expireOverdueActions();
    }
    const { pendingActionId } = job.data as { pendingActionId: string };
    const action = await this.storage.get(pendingActionId);

    if (!action) {
      this.logger.warn(`Pending action ${pendingActionId} not found`);
      return { skipped: true, reason: 'not_found' };
    }
    if (action.status !== 'APPROVED') {
      this.logger.warn(
        `Pending action ${pendingActionId} status=${action.status} (skipping execution)`,
      );
      return { skipped: true, reason: `status_${action.status}` };
    }

    let result: unknown;
    let success = true;

    try {
      if (action.toolName === 'transferToHuman') {
        result = await this.executeTransferToHuman(action);
      } else {
        result = await this.executeHttpSkill(action);
      }
    } catch (err: any) {
      success = false;
      result = { ok: false, error: err?.message ?? String(err) };
      this.logger.error(
        `Pending action ${pendingActionId} (${action.toolName}) failed: ${err?.message ?? err}`,
      );
    }

    await this.prisma.aiPendingAction.update({
      where: { id: pendingActionId },
      data: {
        status: success ? 'EXECUTED' : 'APPROVED', // re-tentável se falhou
        executionResult: (result as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });

    this.logger.log({
      msg: 'pending_action_executed',
      pendingActionId,
      toolName: action.toolName,
      success,
    });

    // Feedback visível na conversa: quem aprovou precisa ver que a ação saiu
    // do papel (ou que falhou) sem ir caçar em log. transferToHuman fica de
    // fora — a transição da conversa já é o feedback.
    if (action.toolName !== 'transferToHuman') {
      await this.notifyConversation(action, success, result);
    }

    return result;
  }

  /**
   * Cron-style cleanup: marca como EXPIRED qualquer PendingAction que
   * passou do `expiresAt` sem ser aprovado/rejeitado. Disparado por
   * repeatable job (a cada 5min) registrado em `confirmations.module`.
   */
  private async expireOverdueActions(): Promise<{ expired: number }> {
    // Pega as ações que vão expirar ANTES do update, pra registrar a linha
    // terminal no log de negócio das que são de marketing (senão o
    // marketing_activities mostraria PENDING_APPROVAL pra sempre).
    const overdue = await this.prisma.aiPendingAction.findMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      select: {
        id: true,
        toolName: true,
        agentId: true,
        agentRunId: true,
        agent: { select: { organizationId: true } },
      },
    });

    const result = await this.prisma.aiPendingAction.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.log({ msg: 'pending_actions_expired', count: result.count });
      await this.logExpiredMarketing(overdue);
    }
    return { expired: result.count };
  }

  /** Grava marketing_activities (FAILED/expirada) p/ ações de marketing expiradas. */
  private async logExpiredMarketing(
    actions: Array<{
      id: string;
      toolName: string;
      agentId: string;
      agentRunId: string;
      agent: { organizationId: string } | null;
    }>,
  ): Promise<void> {
    for (const a of actions) {
      if (!a.agent) continue;
      try {
        const skill = await this.prisma.aiSkill.findFirst({
          where: {
            organizationId: a.agent.organizationId,
            name: a.toolName,
            deletedAt: null,
          },
          select: { category: true },
        });
        if (!skill?.category?.startsWith('Marketing/')) continue;
        await this.prisma.marketingActivity.create({
          data: {
            organizationId: a.agent.organizationId,
            agentId: a.agentId,
            runId: a.agentRunId,
            action: a.toolName,
            status: 'FAILED',
            title: `${a.toolName} expirada`,
            payload: { pendingActionId: a.id, terminal: 'EXPIRED' },
          },
        });
      } catch (e: any) {
        this.logger.warn(`logExpiredMarketing(${a.toolName}) falhou: ${e?.message ?? e}`);
      }
    }
  }

  /** Mensagem de sistema na conversa com o resultado da ação aprovada. */
  private async notifyConversation(
    action: { id: string; conversationId: string; toolName: string; preview?: { action?: string } },
    success: boolean,
    result: unknown,
  ): Promise<void> {
    try {
      const label = action.preview?.action ?? action.toolName;
      const errorDetail =
        !success && result && typeof result === 'object'
          ? String((result as Record<string, unknown>).error ?? '')
          : '';
      const text = success
        ? `✅ Aprovado e executado: ${label}`
        : `❌ Aprovado, mas a execução falhou: ${label}${errorDetail ? ` — ${errorDetail.slice(0, 300)}` : ''}. Você pode aprovar de novo pra re-tentar.`;
      await this.prisma.message.create({
        data: {
          conversationId: action.conversationId,
          direction: MessageDirection.OUTBOUND,
          type: MessageContentType.TEXT,
          content: { text },
          status: MessageStatus.DELIVERED,
          senderName: 'Sistema',
          metadata: { system: true, pendingActionId: action.id },
        },
      });
      await this.prisma.conversation.update({
        where: { id: action.conversationId },
        data: { lastMessageAt: new Date() },
      });
    } catch (e: any) {
      this.logger.warn(
        `notifyConversation(${action.id}) falhou: ${e?.message ?? e}`,
      );
    }
  }

  private async executeTransferToHuman(action: {
    conversationId: string;
    args: Record<string, unknown>;
  }): Promise<unknown> {
    // Pausa a IA na conversa + sinaliza que aguarda atendente humano.
    // Notificações em tempo real (banner no inbox) já foram emitidas no
    // momento da criação do PendingAction — aqui só efetivamos a transição.
    //
    // "Preciso de humano" sem setor explícito cai na FILA do setor padrão
    // (Department isDefault), pra os atendentes desse setor verem. Se a conversa
    // já tem setor, mantém. Se a org não tem setores, segue sem departmentId.
    const conv = await this.prisma.conversation.findUnique({
      where: { id: action.conversationId },
      select: { organizationId: true, departmentId: true },
    });
    let departmentId = conv?.departmentId ?? null;
    if (!departmentId && conv) {
      const dept = await this.prisma.department.findFirst({
        where: { organizationId: conv.organizationId, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      departmentId = dept?.id ?? null;
    }
    await this.prisma.conversation.update({
      where: { id: action.conversationId },
      data: {
        aiEnabled: false,
        activeAgentId: null,
        status: ConversationStatus.PENDING,
        ...(departmentId ? { departmentId } : {}),
      },
    });
    return {
      ok: true,
      transferredAt: new Date().toISOString(),
      reason: action.args?.reason ?? null,
      departmentId,
    };
  }

  private async executeHttpSkill(action: {
    agentRunId: string;
    conversationId: string;
    agentId: string;
    toolName: string;
    args: Record<string, unknown>;
  }): Promise<unknown> {
    // Resolve o run PRIMEIRO pra ter a org — a skill é buscada escopada por
    // organizationId. Sem isso, nomes de skill que colidem entre orgs fariam
    // a ação aprovada da org A executar o tool HTTP (endpoint/credencial) da
    // org B (confusão cross-tenant / SSRF pra endpoint indevido).
    const run = await this.prisma.aiAgentRun.findUnique({
      where: { id: action.agentRunId },
      select: { organizationId: true, triggerMessageId: true },
    });
    if (!run) {
      throw new Error('Run no longer exists');
    }

    const skill = await this.prisma.aiSkill.findFirst({
      where: {
        name: action.toolName,
        isActive: true,
        deletedAt: null,
        organizationId: run.organizationId,
      },
    });
    if (!skill) {
      throw new Error(`Skill ${action.toolName} not found or inactive`);
    }
    if (!skill.toolId) {
      throw new Error(`Skill ${action.toolName} has no bound tool`);
    }
    const tool = await this.prisma.aiTool.findUnique({
      where: { id: skill.toolId },
    });
    if (!tool) {
      throw new Error(`Tool ${skill.toolId} not found for skill ${skill.name}`);
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: action.conversationId },
      select: { contactId: true, channelId: true },
    });
    if (!conversation) {
      throw new Error('Conversation no longer exists');
    }

    const ctx: ToolContext = {
      organizationId: run.organizationId,
      conversationId: action.conversationId,
      contactId: conversation.contactId,
      channelId: conversation.channelId,
      agentId: action.agentId,
      runId: action.agentRunId,
      triggerMessageId: run.triggerMessageId ?? '',
    };

    const result = await this.httpExecutor.execute(
      skill,
      tool,
      action.args,
      ctx,
      { bypassPendingGate: true },
    );
    return result.output;
  }
}
