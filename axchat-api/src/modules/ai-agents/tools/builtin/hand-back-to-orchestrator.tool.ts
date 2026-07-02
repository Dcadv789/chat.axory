import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { RealtimeGateway } from '../../../realtime/realtime.gateway';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * WORKER-only. Returns the conversation to the orchestrator — typically when
 * the customer changes subject to a domain this worker doesn't cover.
 * Clears `activeAgentId` so the next inbound message routes back to the
 * channel's default orchestrator.
 */
@Injectable()
export class HandBackToOrchestratorTool implements AiTool {
  private readonly logger = new Logger(HandBackToOrchestratorTool.name);

  readonly name = 'handBackToOrchestrator';
  readonly description =
    'Devolve a conversa para o orquestrador. Use em DOIS casos: (1) você TERMINOU a tarefa que ele delegou — devolva com um resumo curto do que entregou, é isso que permite o orquestrador continuar o ciclo (sem o hand-back o fluxo PARA em você); (2) o assunto mudou para um domínio fora da sua especialidade.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['reason'],
    properties: {
      reason: {
        type: 'string',
        description:
          'Resumo de 1 frase: o que você entregou (tarefa concluída) ou por que está devolvendo (fora de escopo). Ex: "Análise concluída: campanha X é a melhor, recomendo R$10/dia".',
        minLength: 5,
        maxLength: 300,
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const reason = String(input.reason ?? '').trim();

    // Devolve pro PAI do worker (Magnus na crew de marketing) quando houver.
    // Com activeAgentId=null a resolução dependia do defaultOrchestratorId do
    // CANAL — que não existe no canal interno de crons, então o hand-back
    // morria no vazio e o ciclo parava no worker. Apontar o pai funciona em
    // qualquer canal. Sem pai ativo, cai no comportamento antigo (null →
    // orquestrador default do canal / roteador).
    const self = await this.prisma.aiAgent.findUnique({
      where: { id: ctx.agentId },
      select: { parentAgentId: true },
    });
    const parent = self?.parentAgentId
      ? await this.prisma.aiAgent.findFirst({
          where: { id: self.parentAgentId, isActive: true, deletedAt: null },
          select: { id: true },
        })
      : null;
    const nextAgentId = parent?.id ?? null;

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { activeAgentId: nextAgentId },
      }),
      this.prisma.aiAgentHandoff.create({
        data: {
          conversationId: ctx.conversationId,
          fromAgentId: ctx.agentId,
          // Pai do worker quando conhecido; sem pai, aponta pra si mesmo
          // (slot obrigatório) e o audit log carrega a semântica real.
          toAgentId: nextAgentId ?? ctx.agentId,
          reason,
        },
      }),
      this.prisma.conversationAuditLog.create({
        data: {
          conversationId: ctx.conversationId,
          actorId: null,
          action: 'AI_HANDED_BACK',
          metadata: { fromAgentId: ctx.agentId, reason, runId: ctx.runId },
        },
      }),
    ]);

    this.realtime.emitToConversation(
      ctx.conversationId,
      'conversation:ai-handed-back',
      { conversationId: ctx.conversationId, fromAgentId: ctx.agentId, reason },
    );

    this.logger.log(
      `Worker ${ctx.agentId} handed conv ${ctx.conversationId} back to orchestrator: ${reason}`,
    );

    return {
      output: {
        ok: true,
        message:
          'Devolvido ao orquestrador. Ele vai reavaliar o assunto e encaminhar para o especialista correto — o cliente não precisa mandar outra mensagem.',
      },
      finalAction: 'HANDED_BACK',
    };
  }
}
