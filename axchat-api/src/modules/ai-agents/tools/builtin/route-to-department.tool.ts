import { Injectable, Logger } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { RealtimeGateway } from '../../../realtime/realtime.gateway';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Roteia a conversa para um SETOR humano (Department): Atendimento, Vendas,
 * Financeiro, etc. Diferente de `delegateToAgent` (que passa pra outro agente
 * de IA), aqui a conversa é ENTREGUE AOS HUMANOS daquele setor — a IA para na
 * conversa e ela cai na FILA do setor (sem dono, status PENDING) até um
 * atendente pegar.
 *
 * Execução imediata (sem aprovação): o roteamento é reversível (um humano pode
 * reativar a IA / transferir de volta), e o objetivo é triagem automática.
 *
 * Trava no padrão: quando `organization.routeAllToDefaultSector` está ON, a tool
 * ignora o setor escolhido e sempre usa o setor marcado como padrão.
 */
@Injectable()
export class RouteToDepartmentTool implements AiTool {
  private readonly logger = new Logger(RouteToDepartmentTool.name);

  readonly name = 'routeToDepartment';
  readonly description =
    'Route this conversation to a HUMAN sector/department (e.g. Atendimento, Vendas, Financeiro). Use when the customer needs a human team to take over. The AI stops on this conversation and it lands in that sector\'s queue until an agent picks it up. Pass the departmentId from the list of available sectors. If sector routing is locked to the default, your choice is ignored and the default sector is used.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['reason'],
    properties: {
      departmentId: {
        type: 'string',
        description:
          'ID of the destination sector (Department), taken from the list of available sectors in your context. Omit only if you want the default sector.',
      },
      departmentName: {
        type: 'string',
        description:
          'Fallback: destination sector name (case-insensitive) when you do not have the id. Prefer departmentId.',
      },
      reason: {
        type: 'string',
        description:
          'Short reason for routing, in PT-BR. Visible to the human team. e.g., "Cliente quer comprar o plano anual".',
        minLength: 3,
        maxLength: 500,
      },
      summary: {
        type: 'string',
        description:
          'Optional short summary of the conversation so the human picks up faster.',
        maxLength: 1000,
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
    const reason =
      String(input.reason ?? '').trim() || 'Roteamento sem motivo informado';
    const summary = input.summary ? String(input.summary).trim() : null;
    const wantedId = input.departmentId ? String(input.departmentId).trim() : '';
    const wantedName = input.departmentName
      ? String(input.departmentName).trim()
      : '';

    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { routeAllToDefaultSector: true },
    });

    const departments = await this.prisma.department.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    if (departments.length === 0) {
      return {
        output: {
          ok: false,
          error: 'no_sectors_configured',
          message:
            'Esta organização não tem setores configurados. Use transferToHuman para entregar ao atendimento humano.',
        },
      };
    }

    const defaultDept = departments.find((d) => d.isDefault) ?? departments[0];

    let target = defaultDept;
    if (!org?.routeAllToDefaultSector) {
      if (wantedId) {
        target = departments.find((d) => d.id === wantedId) ?? target;
      } else if (wantedName) {
        const lower = wantedName.toLowerCase();
        target =
          departments.find((d) => d.name.toLowerCase() === lower) ?? target;
      }
    }

    const updated = await this.prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: {
        departmentId: target.id,
        assignedToId: null,
        aiEnabled: false,
        activeAgentId: null,
        status: ConversationStatus.PENDING,
      },
    });

    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId: ctx.conversationId,
        actorId: null,
        action: 'DEPARTMENT_ROUTED',
        toValue: target.id,
        metadata: {
          departmentName: target.name,
          reason,
          summary,
          byAgentId: ctx.agentId,
          locked: !!org?.routeAllToDefaultSector,
        },
      },
    });

    this.realtime.emitToChannel(ctx.channelId, 'conversation:updated', {
      conversation: updated,
    });
    this.realtime.emitToConversation(ctx.conversationId, 'conversation:updated', {
      conversation: updated,
    });

    this.logger.log(
      `Agent ${ctx.agentId} routed conv ${ctx.conversationId} → sector "${target.name}" (${target.id})${org?.routeAllToDefaultSector ? ' [locked-to-default]' : ''}`,
    );

    return {
      output: {
        ok: true,
        routedTo: { id: target.id, name: target.name },
        message: `Conversa roteada pro setor "${target.name}". Atendentes desse setor vão assumir — fluxo padrão, não é erro.`,
        agent_should_say:
          'Avise o cliente, com naturalidade, que um atendente do setor responsável vai continuar o atendimento agora. NÃO mencione "setor", "fila", "roteamento" ou qualquer detalhe interno — fale como uma pessoa.',
      },
      finalAction: 'TRANSFERRED_TO_HUMAN',
    };
  }
}
