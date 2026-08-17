import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { MarketingCredentialsService } from '../../marketing/marketing-credentials.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

const GRAPH = 'https://graph.facebook.com/v25.0';
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

interface LinhaFunil {
  adId: string | null;
  adTitle: string | null;
  origem: string | null;
  leads: number;
  emAberto: number;
  ganhos: number;
  perdidos: number;
  receitaGanha: number;
  gasto: number | null;
  custoPorLead: number | null;
  custoPorCliente: number | null;
  roas: number | null;
  taxaDeGanho: number | null;
}

/**
 * O funil por campanha — de quem chegou a quem fechou.
 *
 * Esta é a resposta que faltava pra crew ser gestora de tráfego e não só
 * operadora de anúncios. As skills do Meta contam o que a Meta sabe: gasto,
 * cliques, CTR, CPC. Nenhuma delas sabe se aquele clique virou cliente, porque
 * a venda acontece do lado de cá — na conversa e no funil.
 *
 * A conta amarra as duas pontas:
 *   Conversation.adId (quem chegou por qual anúncio)
 *     → Card.status/value (o que aconteceu com essa pessoa)
 *       → gasto do Meta (quanto custou trazer)
 *
 * Devolve o funil INTEIRO, não só o que fechou: em aberto, ganho e perdido.
 * Campanha com muito lead e nada fechado é diagnóstico — pode ser público
 * errado, promessa que o anúncio não cumpre, ou atendimento travado. Olhar só
 * o ganho esconde exatamente o caso que precisa de ação.
 */
@Injectable()
export class GetCampaignFunnelTool implements AiTool {
  private readonly logger = new Logger(GetCampaignFunnelTool.name);

  readonly name = 'getCampaignFunnel';
  readonly description =
    'Funil por campanha: quantos leads cada anúncio trouxe, quantos estão EM ABERTO, quantos foram GANHOS e PERDIDOS no pipeline, a receita fechada, o gasto no Meta Ads, e daí custo por lead, custo por cliente, ROAS e taxa de ganho. Use pra decidir onde colocar ou cortar verba — é a única fonte que liga anúncio a venda de verdade. As métricas do Meta param no clique; esta continua até o fechamento.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      dias: {
        type: 'integer',
        minimum: 1,
        maximum: 180,
        description:
          'Janela em dias, contada a partir de hoje. Padrão 30. Use a mesma janela ao comparar campanhas.',
      },
      apenasAnuncios: {
        type: 'boolean',
        description:
          'true (padrão) considera só quem chegou por ANÚNCIO. false inclui origem orgânica (post, link ig.me) — útil pra comparar pago x orgânico, mas essas linhas não têm gasto e o custo por lead vem nulo.',
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MarketingCredentialsService,
  ) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const dias = Math.min(Math.max(Number(input.dias) || 30, 1), 180);
    const apenasAnuncios = input.apenasAnuncios !== false;

    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const conversas = await this.prisma.conversation.findMany({
      where: {
        organizationId: ctx.organizationId,
        adId: { not: null },
        createdAt: { gte: desde },
        ...(apenasAnuncios ? { referralSource: { in: ['ADS', 'ad'] } } : {}),
      },
      select: {
        id: true,
        adId: true,
        adTitle: true,
        referralSource: true,
        cards: { select: { status: true, value: true } },
      },
    });

    if (conversas.length === 0) {
      return {
        output: {
          periodoDias: dias,
          campanhas: [],
          aviso:
            'Nenhuma conversa com origem de anúncio no período. A origem só é gravada a partir do primeiro contato de quem clica num anúncio de clique-para-mensagem — conversas anteriores a isso não têm atribuição, e a Meta não permite recuperar depois.',
        },
      };
    }

    // Agrupa por anúncio. Feito aqui e não no banco porque o valor do card é
    // Decimal e o status precisa virar três contadores — um groupBy devolveria
    // linhas soltas que teriam que ser costuradas de qualquer jeito.
    const porAnuncio = new Map<string, LinhaFunil>();
    for (const c of conversas) {
      const chave = c.adId as string;
      const linha =
        porAnuncio.get(chave) ??
        ({
          adId: c.adId,
          adTitle: c.adTitle,
          origem: c.referralSource,
          leads: 0,
          emAberto: 0,
          ganhos: 0,
          perdidos: 0,
          receitaGanha: 0,
          gasto: null,
          custoPorLead: null,
          custoPorCliente: null,
          roas: null,
          taxaDeGanho: null,
        } as LinhaFunil);

      linha.leads += 1;
      if (!linha.adTitle && c.adTitle) linha.adTitle = c.adTitle;

      for (const card of c.cards) {
        if (card.status === 'WON') {
          linha.ganhos += 1;
          linha.receitaGanha += card.value ? Number(card.value) : 0;
        } else if (card.status === 'LOST') {
          linha.perdidos += 1;
        } else {
          linha.emAberto += 1;
        }
      }
      porAnuncio.set(chave, linha);
    }

    const gastos = await this.gastoPorAnuncio(
      ctx.organizationId,
      [...porAnuncio.keys()],
      dias,
    );

    const r2 = (v: number) => Math.round(v * 100) / 100;
    for (const linha of porAnuncio.values()) {
      const gasto = linha.adId ? (gastos.valores.get(linha.adId) ?? null) : null;
      linha.gasto = gasto;
      // Decididos = quem já teve desfecho. Taxa de ganho sobre o total de leads
      // puniria campanha recente, onde quase todo mundo ainda está em aberto.
      const decididos = linha.ganhos + linha.perdidos;
      linha.taxaDeGanho =
        decididos > 0 ? r2((linha.ganhos / decididos) * 100) : null;
      if (gasto != null && gasto > 0) {
        linha.custoPorLead = linha.leads > 0 ? r2(gasto / linha.leads) : null;
        linha.custoPorCliente =
          linha.ganhos > 0 ? r2(gasto / linha.ganhos) : null;
        linha.roas = r2(linha.receitaGanha / gasto);
      }
      linha.receitaGanha = r2(linha.receitaGanha);
    }

    const campanhas = [...porAnuncio.values()].sort((a, b) => b.leads - a.leads);
    const totalLeads = campanhas.reduce((s, c) => s + c.leads, 0);
    const totalGanhos = campanhas.reduce((s, c) => s + c.ganhos, 0);
    const totalReceita = campanhas.reduce((s, c) => s + c.receitaGanha, 0);
    const totalGasto = campanhas.reduce((s, c) => s + (c.gasto ?? 0), 0);

    return {
      output: {
        periodoDias: dias,
        apenasAnuncios,
        totais: {
          leads: totalLeads,
          ganhos: totalGanhos,
          receitaGanha: r2(totalReceita),
          gasto: r2(totalGasto),
          custoPorLead: totalLeads > 0 && totalGasto > 0 ? r2(totalGasto / totalLeads) : null,
          custoPorCliente:
            totalGanhos > 0 && totalGasto > 0 ? r2(totalGasto / totalGanhos) : null,
          roas: totalGasto > 0 ? r2(totalReceita / totalGasto) : null,
        },
        campanhas,
        ...(gastos.aviso ? { aviso: gastos.aviso } : {}),
      },
    };
  }

  /**
   * Gasto por anúncio no Meta.
   *
   * Falha de credencial ou de rede NÃO derruba a ferramenta: o funil por si só
   * já responde muita coisa (quantos leads, quantos fecharam), e devolver nada
   * porque o Meta não respondeu seria pior do que devolver sem o custo.
   */
  private async gastoPorAnuncio(
    orgId: string,
    adIds: string[],
    dias: number,
  ): Promise<{ valores: Map<string, number>; aviso: string | null }> {
    const valores = new Map<string, number>();
    if (adIds.length === 0) return { valores, aviso: null };

    const cred = await this.credentials.resolve(orgId);
    const adAccountId = cred.adAccountId ?? null;
    const token = cred.adsToken ?? null;
    if (!adAccountId || !token) {
      return {
        valores,
        aviso:
          'Credenciais do Meta Ads ausentes — o funil vai sem gasto, então custo por lead, custo por cliente e ROAS ficam nulos.',
      };
    }

    const nowBrt = new Date(Date.now() - BRT_OFFSET_MS);
    const pad = (v: number) => String(v).padStart(2, '0');
    const dia = (d: Date) =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const until = dia(nowBrt);
    const since = dia(new Date(nowBrt.getTime() - dias * 24 * 60 * 60 * 1000));

    try {
      const acct = adAccountId.replace(/^act_/, '');
      const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
      const filtering = encodeURIComponent(
        JSON.stringify([{ field: 'ad.id', operator: 'IN', value: adIds }]),
      );
      const url =
        `${GRAPH}/act_${encodeURIComponent(acct)}/insights` +
        `?fields=ad_id,spend&level=ad&time_range=${timeRange}` +
        `&filtering=${filtering}&limit=500` +
        `&access_token=${encodeURIComponent(token)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);

      for (const row of json?.data ?? []) {
        if (row?.ad_id) valores.set(String(row.ad_id), Number(row.spend ?? 0));
      }
      return { valores, aviso: null };
    } catch (err: any) {
      const msg = `Não consegui ler o gasto no Meta: ${err?.message ?? err}`;
      this.logger.warn(`getCampaignFunnel spend: ${msg}`);
      return { valores, aviso: `${msg} O funil abaixo está sem custo.` };
    }
  }
}
