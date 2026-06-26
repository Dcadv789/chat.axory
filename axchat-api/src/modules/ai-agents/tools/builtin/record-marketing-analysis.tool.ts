import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

const KINDS = new Set([
  'PERFORMANCE',
  'STRATEGY',
  'MEASUREMENT',
  'AUDIENCE',
  'OUTRO',
]);

/**
 * Grava uma análise/relatório de marketing NO BANCO (tabela marketing_analyses)
 * + registra no log de atividade (marketing_activities). É assim que os workers
 * (Alaric/Edda/...) persistem o que descobriram — tudo fica salvo e auditável.
 */
@Injectable()
export class RecordMarketingAnalysisTool implements AiTool {
  private readonly logger = new Logger(RecordMarketingAnalysisTool.name);

  readonly name = 'recordMarketingAnalysis';
  readonly description =
    'Salva no banco uma análise/relatório de marketing (performance, estratégia, mensuração ou definição de público). Use SEMPRE pra registrar o resultado do seu trabalho — fica auditável e disponível pros outros agentes.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'title', 'summary'],
    properties: {
      kind: {
        type: 'string',
        enum: ['PERFORMANCE', 'STRATEGY', 'MEASUREMENT', 'AUDIENCE', 'OUTRO'],
        description: 'Tipo da análise.',
      },
      title: { type: 'string', description: 'Título curto da análise.' },
      summary: {
        type: 'string',
        description: 'Texto da análise: o que foi visto e concluído.',
      },
      recommendations: {
        type: 'string',
        description: 'O que fazer a seguir (opcional).',
      },
      data: {
        type: 'object',
        description:
          'Métricas/achados estruturados (opcional). Ex: {"cpa": 12.3, "ctr": 1.8}.',
        additionalProperties: true,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const kind = KINDS.has(String(input.kind)) ? String(input.kind) : 'OUTRO';
    const title = String(input.title ?? '').trim();
    const summary = String(input.summary ?? '').trim();
    if (!title || !summary) {
      return { output: { ok: false, error: 'title e summary são obrigatórios' } };
    }

    const analysis = await this.prisma.marketingAnalysis.create({
      data: {
        organizationId: ctx.organizationId,
        agentId: ctx.agentId,
        runId: ctx.runId,
        kind,
        title,
        summary,
        recommendations: input.recommendations
          ? String(input.recommendations)
          : null,
        data: (input.data as object | undefined) ?? undefined,
      },
    });

    await this.prisma.marketingActivity.create({
      data: {
        organizationId: ctx.organizationId,
        agentId: ctx.agentId,
        runId: ctx.runId,
        action: 'ANALYSIS_RECORDED',
        status: 'OK',
        title: `${kind}: ${title}`,
        payload: { analysisId: analysis.id, kind },
      },
    });

    this.logger.log(
      `recordMarketingAnalysis: ${kind} "${title}" salvo (org=${ctx.organizationId}, analysis=${analysis.id})`,
    );
    return { output: { ok: true, analysisId: analysis.id } };
  }
}
