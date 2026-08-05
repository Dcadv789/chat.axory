import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/** De onde saiu o valor de um mês — o front usa isso pra esmaecer o herdado. */
export type BudgetOrigin = 'explicit' | 'inherited' | 'legacy' | 'none';

export interface ResolvedMonthBudget {
  year: number;
  month: number;
  amountCents: number | null;
  origin: BudgetOrigin;
  /** Quando herdado, de qual mês veio (pra tela mostrar "herdado de jan/2026"). */
  inheritedFrom: { year: number; month: number } | null;
  note: string | null;
}

/**
 * Verba de mídia mês a mês.
 *
 * Regra de resolução: o mês sem registro próprio herda o registro mais RECENTE
 * que seja <= a ele. Isso resolve as duas dores de uma vez — não precisa
 * redigitar todo mês, e mexer na verba de hoje NÃO reescreve o pacing dos meses
 * passados (que era o que acontecia com o valor único do perfil).
 *
 * Último recurso: `MarketingProfile.monthlyAdBudgetCents`, o campo legado, que
 * cobre os meses anteriores ao primeiro registro explícito.
 */
@Injectable()
export class MarketingBudgetService {
  private readonly logger = new Logger(MarketingBudgetService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertYearMonth(year: number, month: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Ano inválido.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Mês inválido (use 1 a 12).');
    }
  }

  /** Chave comparável de (ano, mês) — evita comparar os dois campos na mão. */
  private key(year: number, month: number) {
    return year * 12 + (month - 1);
  }

  /**
   * Verba efetiva de um mês. É isto que o pacing deve usar — nunca o campo do
   * perfil direto.
   */
  async resolveForMonth(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<ResolvedMonthBudget> {
    this.assertYearMonth(year, month);

    // Mais recente <= (year, month). O filtro OR cobre "ano anterior" e
    // "mesmo ano, mês <=" — comparar ano*12+mês no banco exigiria SQL cru.
    const candidate = await this.prisma.marketingMonthlyBudget.findFirst({
      where: {
        organizationId,
        OR: [{ year: { lt: year } }, { year, month: { lte: month } }],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    if (candidate) {
      const isExplicit = candidate.year === year && candidate.month === month;
      return {
        year,
        month,
        amountCents: candidate.amountCents,
        origin: isExplicit ? 'explicit' : 'inherited',
        inheritedFrom: isExplicit
          ? null
          : { year: candidate.year, month: candidate.month },
        note: isExplicit ? candidate.note : null,
      };
    }

    // Nenhum registro até este mês: cai no valor legado do perfil.
    const profile = await this.prisma.marketingProfile.findUnique({
      where: { organizationId },
      select: { monthlyAdBudgetCents: true },
    });
    const legacy = profile?.monthlyAdBudgetCents ?? null;

    return {
      year,
      month,
      amountCents: legacy,
      origin: legacy != null ? 'legacy' : 'none',
      inheritedFrom: null,
      note: null,
    };
  }

  /** Os 12 meses de um ano, já resolvidos (explícito / herdado / legado). */
  async listYear(organizationId: string, year: number) {
    this.assertYearMonth(year, 1);

    const [rows, profile] = await Promise.all([
      this.prisma.marketingMonthlyBudget.findMany({
        where: { organizationId, year: { lte: year } },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      }),
      this.prisma.marketingProfile.findUnique({
        where: { organizationId },
        select: { monthlyAdBudgetCents: true, currency: true },
      }),
    ]);

    const legacy = profile?.monthlyAdBudgetCents ?? null;

    // Uma varredura só: percorre os meses em ordem carregando o último valor
    // visto. Bem melhor que 12 queries de "mais recente <= mês".
    const months: ResolvedMonthBudget[] = [];
    for (let month = 1; month <= 12; month++) {
      const limit = this.key(year, month);
      let last: (typeof rows)[number] | null = null;
      for (const row of rows) {
        if (this.key(row.year, row.month) <= limit) last = row;
        else break;
      }

      if (!last) {
        months.push({
          year,
          month,
          amountCents: legacy,
          origin: legacy != null ? 'legacy' : 'none',
          inheritedFrom: null,
          note: null,
        });
        continue;
      }

      const isExplicit = last.year === year && last.month === month;
      months.push({
        year,
        month,
        amountCents: last.amountCents,
        origin: isExplicit ? 'explicit' : 'inherited',
        inheritedFrom: isExplicit ? null : { year: last.year, month: last.month },
        note: isExplicit ? last.note : null,
      });
    }

    return {
      year,
      currency: profile?.currency ?? 'BRL',
      legacyAmountCents: legacy,
      months,
    };
  }

  /** Define (ou corrige) a verba de um mês específico. */
  async setMonth(
    organizationId: string,
    year: number,
    month: number,
    amountCents: number,
    note?: string | null,
  ) {
    this.assertYearMonth(year, month);
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      throw new BadRequestException('Valor da verba inválido.');
    }

    await this.prisma.marketingMonthlyBudget.upsert({
      where: {
        uq_marketing_budget_month: { organizationId, year, month },
      },
      create: {
        organizationId,
        year,
        month,
        amountCents,
        note: note?.trim() || null,
      },
      update: { amountCents, note: note?.trim() || null },
    });

    this.logger.log(
      `Verba de ${month}/${year} definida em ${amountCents} centavos (org ${organizationId})`,
    );
    return this.listYear(organizationId, year);
  }

  /**
   * Remove o valor próprio do mês — ele volta a herdar do mês anterior.
   * Não é "zerar a verba": zerar é `setMonth(..., 0)`.
   */
  async clearMonth(organizationId: string, year: number, month: number) {
    this.assertYearMonth(year, month);
    await this.prisma.marketingMonthlyBudget.deleteMany({
      where: { organizationId, year, month },
    });
    return this.listYear(organizationId, year);
  }
}
