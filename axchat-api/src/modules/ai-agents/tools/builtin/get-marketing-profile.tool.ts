import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Lê o PERFIL/REGRAS de marketing da org (o que a empresa faz, produtos,
 * público-alvo, tom, diretrizes e tetos de verba). Permite o agente definir
 * público/ângulo de forma autônoma, dentro das regras da organização.
 */
@Injectable()
export class GetMarketingProfileTool implements AiTool {
  readonly name = 'getMarketingProfile';
  readonly description =
    'Lê as regras de marketing da organização: o que a empresa faz, produtos/serviços, público-alvo padrão, tom de voz, diretrizes e tetos de verba (mensal/diário). Use ANTES de definir público, criar campanha ou escrever copy.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {},
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    _input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const p = await this.prisma.marketingProfile.findUnique({
      where: { organizationId: ctx.organizationId },
    });

    if (!p) {
      return {
        output: {
          ok: true,
          configured: false,
          message:
            'Perfil de marketing ainda não configurado. Peça pra preencher em Configurações → Marketing (regras, produtos, público, verba). Não invente regras nem verba.',
        },
      };
    }

    return {
      output: {
        ok: true,
        configured: true,
        companyDescription: p.companyDescription,
        products: p.products,
        targetAudience: p.targetAudience,
        toneOfVoice: p.toneOfVoice,
        guidelines: p.guidelines,
        monthlyAdBudgetCents: p.monthlyAdBudgetCents,
        maxDailyBudgetCents: p.maxDailyBudgetCents,
        currency: p.currency,
        externalRulesSkill: p.externalRulesSkill,
        note: p.externalRulesSkill
          ? `Há regras adicionais num banco externo — consulte também a skill "${p.externalRulesSkill}".`
          : undefined,
      },
    };
  }
}
