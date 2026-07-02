import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

const GRAPH = 'https://graph.facebook.com/v21.0';
// America/Sao_Paulo = UTC-3 fixo desde 2019 (sem horário de verão).
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Pacing da verba de anúncios do MÊS CORRENTE: teto mensal do perfil × gasto
 * real no Meta (dia 1 → hoje) × dias restantes. A conta fica no backend de
 * propósito — decisão diária de verba não pode depender de aritmética do LLM.
 */
@Injectable()
export class GetBudgetPacingTool implements AiTool {
  private readonly logger = new Logger(GetBudgetPacingTool.name);

  readonly name = 'getBudgetPacing';
  readonly description =
    'Calcula o pacing da verba de anúncios do MÊS CORRENTE: teto mensal configurado no perfil, gasto real até hoje (Meta Ads), % do mês decorrido, dias restantes, ritmo diário atual, projeção de fechamento do mês e verba diária sugerida pro que resta. Use SEMPRE antes de decidir aumentar/diminuir orçamento de campanha ou criar campanha nova — é a régua de quanto ainda pode gastar.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {},
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async resolve(orgId: string, key: string): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findFirst({
      where: { organizationId: orgId, key },
      select: { value: true },
    });
    return secret?.value ?? this.config.get<string>(key) ?? null;
  }

  async execute(
    _input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const profile = await this.prisma.marketingProfile.findUnique({
      where: { organizationId: ctx.organizationId },
      select: {
        monthlyAdBudgetCents: true,
        maxDailyBudgetCents: true,
        currency: true,
      },
    });

    // Calendário no fuso da operação (BRT).
    const nowBrt = new Date(Date.now() - BRT_OFFSET_MS);
    const year = nowBrt.getUTCFullYear();
    const month = nowBrt.getUTCMonth(); // 0-based
    const dayOfMonth = nowBrt.getUTCDate();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    // "Restantes" INCLUI hoje: a decisão de hoje ainda afeta o gasto de hoje.
    const daysRemaining = daysInMonth - dayOfMonth + 1;
    const pad = (v: number) => String(v).padStart(2, '0');
    const today = `${year}-${pad(month + 1)}-${pad(dayOfMonth)}`;
    const firstOfMonth = `${year}-${pad(month + 1)}-01`;

    // Gasto real do mês (Meta). Falha de credencial/rede não derruba a tool —
    // devolve o pacing de calendário + teto com spend nulo e aviso.
    let spentMonth: number | null = null;
    let spendWarning: string | null = null;
    const [adAccountId, token] = await Promise.all([
      this.resolve(ctx.organizationId, 'META_AD_ACCOUNT_ID'),
      this.resolve(ctx.organizationId, 'META_ADS_ACCESS_TOKEN'),
    ]);
    if (!adAccountId || !token) {
      spendWarning =
        'Credenciais do Meta Ads ausentes — gasto real do mês indisponível.';
    } else {
      try {
        const acct = adAccountId.replace(/^act_/, '');
        const timeRange = encodeURIComponent(
          JSON.stringify({ since: firstOfMonth, until: today }),
        );
        const url =
          `${GRAPH}/act_${encodeURIComponent(acct)}/insights` +
          `?fields=spend&time_range=${timeRange}` +
          `&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const json: any = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        }
        const row = Array.isArray(json?.data) ? json.data[0] : null;
        spentMonth = row?.spend != null ? Number(row.spend) : 0;
      } catch (err: any) {
        spendWarning = `Não consegui ler o gasto do mês no Meta: ${err?.message ?? err}`;
        this.logger.warn(`getBudgetPacing spend fetch: ${spendWarning}`);
      }
    }

    const currency = profile?.currency ?? 'BRL';
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const monthlyBudget =
      profile?.monthlyAdBudgetCents != null
        ? profile.monthlyAdBudgetCents / 100
        : null;
    const maxDailyBudget =
      profile?.maxDailyBudgetCents != null
        ? profile.maxDailyBudgetCents / 100
        : null;

    let pacing: Record<string, unknown> = {};
    if (monthlyBudget != null && spentMonth != null) {
      const remaining = round2(monthlyBudget - spentMonth);
      const dailyRunRate = round2(spentMonth / dayOfMonth);
      const projectedMonthEnd = round2(dailyRunRate * daysInMonth);
      const suggestedDailyForRest = round2(
        Math.max(0, remaining) / daysRemaining,
      );
      const pctBudgetUsed = round2((spentMonth / monthlyBudget) * 100);
      const pctMonthElapsed = round2((dayOfMonth / daysInMonth) * 100);
      // Margem de 10% pra não oscilar decisão com variação normal de leilão.
      const status =
        projectedMonthEnd > monthlyBudget * 1.1
          ? 'RITMO_ACIMA_DO_TETO'
          : projectedMonthEnd < monthlyBudget * 0.8
            ? 'RITMO_ABAIXO_DO_TETO'
            : 'NO_RITMO';
      pacing = {
        remainingBudget: remaining,
        dailyRunRate,
        projectedMonthEndSpend: projectedMonthEnd,
        suggestedDailyForRest,
        pctBudgetUsed,
        pctMonthElapsed,
        status,
      };
    }

    return {
      output: {
        ok: true,
        today,
        month: `${year}-${pad(month + 1)}`,
        daysInMonth,
        dayOfMonth,
        daysRemaining,
        currency,
        monthlyBudget,
        maxDailyBudgetPerCampaign: maxDailyBudget,
        spentMonthToDate: spentMonth,
        ...pacing,
        ...(spendWarning ? { warning: spendWarning } : {}),
        ...(monthlyBudget == null
          ? {
              note: 'Teto mensal não configurado no perfil de marketing — sem régua de pacing. Peça pra configurar em Configurações → Marketing.',
            }
          : {}),
      },
    };
  }
}
