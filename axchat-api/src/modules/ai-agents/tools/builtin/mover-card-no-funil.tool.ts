import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { PipelinesService } from '../../../pipelines/pipelines.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Deixa o agente registrar no funil o que aconteceu na conversa.
 *
 * Antes o CRM só andava se um humano lembrasse de arrastar o card. Num time
 * pequeno isso desatualiza em uma semana — e um funil desatualizado é pior que
 * nenhum, porque as decisões passam a ser tomadas com número errado.
 *
 * O agente move dentro do funil da CONVERSA ATUAL. Não cria card do nada, não
 * escolhe outro cliente, não fecha negócio de terceiros: só reflete o que ele
 * acabou de viver na conversa.
 */
@Injectable()
export class MoverCardNoFunilTool implements AiTool {
  private readonly logger = new Logger(MoverCardNoFunilTool.name);

  readonly name = 'moverCardNoFunil';
  readonly description =
    'Move o card desta conversa para outra etapa do funil, registrando o avanço real do atendimento (ex: cliente aceitou receber proposta → "Proposta enviada"; cliente disse que não tem interesse → "Perdido"). Use quando a conversa MUDAR de estágio de verdade — não a cada mensagem. Se não existir card para esta conversa, um é criado na etapa indicada.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['etapa'],
    properties: {
      etapa: {
        type: 'string',
        description:
          'Nome da etapa de destino, como aparece no funil. Ex: "Proposta enviada", "Perdido".',
      },
      motivo: {
        type: 'string',
        description:
          'Uma frase dizendo o que na conversa justifica a mudança. Vai pro histórico e é o que explica a decisão depois.',
      },
      valor: {
        type: 'number',
        description:
          'Valor do negócio em reais, quando o cliente confirmar. Sem ele, uma venda ganha entra com receita zero e o relatório de campanha fica errado.',
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelines: PipelinesService,
  ) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const etapaPedida = String(input.etapa ?? '').trim();
    if (!etapaPedida) {
      return { output: { ok: false, erro: 'Diga para qual etapa mover.' } };
    }

    const card = await this.prisma.card.findFirst({
      where: { organizationId: ctx.organizationId, conversationId: ctx.conversationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, pipelineId: true, stageId: true },
    });

    // Sem card ainda: usa o funil padrão da organização. Sem funil nenhum, a
    // ferramenta avisa em vez de falhar calada — quem lê o log precisa saber
    // que faltou configurar, não achar que a IA errou.
    const pipelineId =
      card?.pipelineId ??
      (
        await this.prisma.pipeline.findFirst({
          where: { organizationId: ctx.organizationId, archived: false },
          orderBy: [{ isDefault: 'desc' }, { order: 'asc' }],
          select: { id: true },
        })
      )?.id;

    if (!pipelineId) {
      return {
        output: {
          ok: false,
          erro: 'Esta empresa ainda não tem funil configurado. Nada foi registrado.',
        },
      };
    }

    const etapas = await this.prisma.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, type: true },
    });

    const alvo = this.acharEtapa(etapas, etapaPedida);
    if (!alvo) {
      return {
        output: {
          ok: false,
          erro: `Não existe etapa "${etapaPedida}" neste funil.`,
          // Devolver as opções evita o agente tentar adivinhar variações.
          etapasDisponiveis: etapas.map((e) => e.name),
        },
      };
    }

    try {
      if (!card) {
        const contato = await this.prisma.conversation.findUnique({
          where: { id: ctx.conversationId },
          select: { contact: { select: { id: true, name: true, phone: true } } },
        });
        const criado = await this.pipelines.createCard(
          pipelineId,
          ctx.organizationId,
          {
            stageId: alvo.id,
            title: contato?.contact?.name ?? contato?.contact?.phone ?? 'Lead',
            contactId: contato?.contact?.id,
            conversationId: ctx.conversationId,
            ...(typeof input.valor === 'number' ? { value: input.valor } : {}),
          } as any,
          { origem: 'IA', agentId: ctx.agentId },
        );
        return {
          output: {
            ok: true,
            criado: true,
            card: criado.id,
            etapa: alvo.name,
            aviso: 'Não havia card para esta conversa — criei um já na etapa pedida.',
          },
        };
      }

      if (card.stageId === alvo.id) {
        return {
          output: { ok: true, semMudanca: true, etapa: alvo.name },
        };
      }

      if (typeof input.valor === 'number') {
        await this.prisma.card.update({
          where: { id: card.id },
          data: { value: input.valor },
        });
      }

      await this.pipelines.moveCard(
        card.id,
        ctx.organizationId,
        { toStageId: alvo.id, toIndex: 0 } as any,
        { origem: 'IA', agentId: ctx.agentId },
      );

      return {
        output: {
          ok: true,
          etapa: alvo.name,
          fechado: alvo.type !== 'NORMAL',
          motivo: input.motivo ?? null,
        },
      };
    } catch (err) {
      this.logger.warn(`moverCardNoFunil falhou: ${(err as Error).message}`);
      return {
        output: { ok: false, erro: (err as Error).message },
      };
    }
  }

  /**
   * O modelo escreve o nome da etapa de memória, então "proposta" precisa
   * casar com "Proposta enviada". Exato primeiro, depois contido — sem
   * inventar semelhança, pra não mover pra etapa errada.
   */
  private acharEtapa(
    etapas: Array<{ id: string; name: string; type: string }>,
    pedida: string,
  ) {
    const norm = (t: string) =>
      t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const alvo = norm(pedida);
    return (
      etapas.find((e) => norm(e.name) === alvo) ??
      etapas.find((e) => norm(e.name).includes(alvo)) ??
      etapas.find((e) => alvo.includes(norm(e.name)))
    );
  }
}
