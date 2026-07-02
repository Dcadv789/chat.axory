import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

const VALID_KINDS = new Set([
  'PERFORMANCE',
  'STRATEGY',
  'MEASUREMENT',
  'AUDIENCE',
  'OUTRO',
]);

/**
 * Leitura das análises/decisões já gravadas (recordMarketingAnalysis). É a
 * memória de trabalho do ciclo diário: sem isso cada rodada começa do zero,
 * repete recomendação e contradiz decisão recente sem saber.
 */
@Injectable()
export class GetRecentMarketingAnalysesTool implements AiTool {
  readonly name = 'getRecentMarketingAnalyses';
  readonly description =
    'Lê as últimas análises e decisões de marketing gravadas pela crew (performance, estratégia, mensuração). Use no INÍCIO de toda análise diária/periódica pra ter o contexto do que já foi analisado e decidido antes — comparar com os números de hoje, manter continuidade e não repetir/contradizer decisão recente sem motivo.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: {
        type: 'integer',
        description: 'Quantas análises trazer (mais recentes primeiro).',
        default: 10,
        minimum: 1,
        maximum: 30,
      },
      kind: {
        type: 'string',
        description:
          'Filtra por tipo: PERFORMANCE, STRATEGY, MEASUREMENT, AUDIENCE. Omita pra trazer todos.',
      },
      sinceDays: {
        type: 'integer',
        description: 'Janela em dias (padrão 30).',
        default: 30,
        minimum: 1,
        maximum: 365,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 30);
    const sinceDays = Math.min(
      Math.max(Number(input.sinceDays) || 30, 1),
      365,
    );
    const kind =
      typeof input.kind === 'string' && VALID_KINDS.has(input.kind.toUpperCase())
        ? input.kind.toUpperCase()
        : undefined;
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.marketingAnalysis.findMany({
      where: {
        organizationId: ctx.organizationId,
        createdAt: { gte: since },
        ...(kind ? { kind } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        agentId: true,
        kind: true,
        title: true,
        summary: true,
        recommendations: true,
        createdAt: true,
      },
    });

    // Nome do agente autor (MarketingAnalysis não tem relation com AiAgent).
    const agentIds = [...new Set(rows.map((r) => r.agentId).filter(Boolean))] as string[];
    const agents = agentIds.length
      ? await this.prisma.aiAgent.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(agents.map((a) => [a.id, a.name]));

    return {
      output: {
        ok: true,
        count: rows.length,
        sinceDays,
        ...(rows.length === 0
          ? {
              note: 'Nenhuma análise gravada no período — este é o primeiro ciclo ou a janela é curta demais.',
            }
          : {}),
        analyses: rows.map((r) => ({
          when: r.createdAt.toISOString(),
          agent: r.agentId ? (nameById.get(r.agentId) ?? null) : null,
          kind: r.kind,
          title: r.title,
          summary: r.summary,
          recommendations: r.recommendations,
        })),
      },
    };
  }
}
