import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Os briefings das campanhas em andamento.
 *
 * O perfil de marketing (`getMarketingProfile`) diz quem é a empresa — vale
 * para tudo. Isto diz o que CADA campanha está tentando conseguir, e é o que
 * permite duas campanhas simultâneas quererem coisas diferentes: uma captando
 * lead frio para BPO contábil, outra reativando cliente antigo de consultoria.
 *
 * Sem isso, a crew tratava as duas com a mesma mensagem e o mesmo público,
 * porque só existia um contexto para a empresa inteira.
 */
@Injectable()
export class GetCampaignBriefsTool implements AiTool {
  readonly name = 'getCampaignBriefs';
  readonly description =
    'Lista os briefings das campanhas: objetivo, público, oferta, mensagem central, restrições e verba de cada uma. Consulte SEMPRE antes de criar conteúdo ou anúncio — é o que diz qual campanha está pedindo o quê. O perfil da empresa vale para tudo; o briefing vale para uma campanha só e tem precedência sobre o perfil quando os dois falam do mesmo assunto.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      incluirPausadas: {
        type: 'boolean',
        description:
          'false (padrão) traz só as campanhas ativas. true inclui as pausadas — útil para consultar histórico, não para produzir conteúdo.',
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const incluirPausadas = input.incluirPausadas === true;

    const briefings = await this.prisma.marketingCampaignBrief.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: incluirPausadas
          ? { in: ['ACTIVE', 'PAUSED'] }
          : { equals: 'ACTIVE' },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        objective: true,
        targetAudience: true,
        offer: true,
        keyMessage: true,
        restrictions: true,
        adIds: true,
        monthlyBudgetCents: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (briefings.length === 0) {
      return {
        output: {
          campanhas: [],
          aviso:
            'Nenhuma campanha com briefing cadastrado. Sem briefing, use o perfil da empresa (getMarketingProfile) como contexto e diga na sua entrega que não havia briefing específico — assim quem lê sabe que a direção foi inferida, não definida.',
        },
      };
    }

    const hoje = Date.now();
    return {
      output: {
        campanhas: briefings.map((b) => ({
          ...b,
          verbaMensal:
            b.monthlyBudgetCents != null ? b.monthlyBudgetCents / 100 : null,
          monthlyBudgetCents: undefined,
          // Campanha com data marcada e já vencida ainda aparece como ativa no
          // banco até alguém pausar. Marcar aqui evita a crew produzir pra uma
          // campanha que acabou semana passada.
          venceu: b.endsAt ? b.endsAt.getTime() < hoje : false,
          aindaNaoComecou: b.startsAt ? b.startsAt.getTime() > hoje : false,
        })),
        instrucao:
          'Quando o briefing e o perfil da empresa falarem do mesmo assunto (público, oferta, tom), o BRIEFING vence — ele é a direção específica desta campanha. As restrições se SOMAM: valem as da empresa e as da campanha, nunca uma no lugar da outra.',
      },
    };
  }
}
