import { GetCampaignFunnelTool } from './get-campaign-funnel.tool';

/**
 * Aqui o que se testa é a ARITMÉTICA e as bordas dela.
 *
 * Número errado numa tela de tráfego não dá erro: dá decisão errada. Se o
 * custo por cliente sair menor do que é, a campanha parece boa e a verba sobe.
 * Por isso cada divisão tem um teste em cima do denominador zero.
 */
describe('getCampaignFunnel', () => {
  function montar(conversas: any[], gastoPorAd: Record<string, number> = {}) {
    const prisma = {
      conversation: { findMany: jest.fn().mockResolvedValue(conversas) },
    } as any;
    const credentials = {
      resolve: jest
        .fn()
        .mockResolvedValue({ adAccountId: 'act_1', adsToken: 'tok' }),
    } as any;

    const tool = new GetCampaignFunnelTool(prisma, credentials);
    // Intercepta a ida ao Meta: o teste é da conta, não da rede.
    (tool as any).gastoPorAnuncio = jest.fn().mockResolvedValue({
      valores: new Map(Object.entries(gastoPorAd)),
      aviso: null,
    });
    return { tool, prisma };
  }

  const ctx = { organizationId: 'org-1' } as any;

  const conversa = (adId: string, cards: any[], extra: any = {}) => ({
    id: `c-${Math.random()}`,
    adId,
    adTitle: 'Campanha Maio',
    referralSource: 'ADS',
    cards,
    ...extra,
  });

  it('conta o funil inteiro, não só o que fechou', async () => {
    const { tool } = montar([
      conversa('ad-1', [{ status: 'WON', value: 1000 }]),
      conversa('ad-1', [{ status: 'LOST', value: null }]),
      conversa('ad-1', [{ status: 'OPEN', value: null }]),
      conversa('ad-1', []), // lead sem card ainda
    ]);

    const r: any = await tool.execute({}, ctx);
    const linha = r.output.campanhas[0];

    expect(linha.leads).toBe(4);
    expect(linha.ganhos).toBe(1);
    expect(linha.perdidos).toBe(1);
    expect(linha.emAberto).toBe(1);
  });

  it('calcula custo por lead e por cliente — que são coisas diferentes', async () => {
    const { tool } = montar(
      [
        conversa('ad-1', [{ status: 'WON', value: 3000 }]),
        conversa('ad-1', [{ status: 'LOST', value: null }]),
        conversa('ad-1', [{ status: 'OPEN', value: null }]),
        conversa('ad-1', [{ status: 'OPEN', value: null }]),
      ],
      { 'ad-1': 600 },
    );

    const r: any = await tool.execute({}, ctx);
    const linha = r.output.campanhas[0];

    expect(linha.custoPorLead).toBe(150); // 600 / 4 leads
    expect(linha.custoPorCliente).toBe(600); // 600 / 1 cliente
    expect(linha.roas).toBe(5); // 3000 / 600
  });

  it('taxa de ganho conta sobre DECIDIDOS, não sobre o total', async () => {
    const { tool } = montar([
      conversa('ad-1', [{ status: 'WON', value: 100 }]),
      conversa('ad-1', [{ status: 'LOST', value: null }]),
      // Oito ainda em aberto: numa campanha recente é o normal.
      ...Array.from({ length: 8 }, () =>
        conversa('ad-1', [{ status: 'OPEN', value: null }]),
      ),
    ]);

    const r: any = await tool.execute({}, ctx);
    // 1 ganho de 2 decididos = 50%. Sobre os 10 leads daria 10% e faria uma
    // campanha nova parecer péssima só por ser nova.
    expect(r.output.campanhas[0].taxaDeGanho).toBe(50);
  });

  it('sem gasto conhecido, não inventa custo', async () => {
    const { tool } = montar([conversa('ad-1', [{ status: 'WON', value: 500 }])]);

    const r: any = await tool.execute({}, ctx);
    const linha = r.output.campanhas[0];

    expect(linha.gasto).toBeNull();
    expect(linha.custoPorLead).toBeNull();
    expect(linha.roas).toBeNull();
    // O funil continua útil mesmo sem o custo.
    expect(linha.ganhos).toBe(1);
  });

  it('campanha sem nenhum ganho não divide por zero', async () => {
    const { tool } = montar(
      [
        conversa('ad-1', [{ status: 'LOST', value: null }]),
        conversa('ad-1', [{ status: 'OPEN', value: null }]),
      ],
      { 'ad-1': 900 },
    );

    const r: any = await tool.execute({}, ctx);
    const linha = r.output.campanhas[0];

    expect(linha.custoPorLead).toBe(450); // 900 / 2 — este existe
    expect(linha.custoPorCliente).toBeNull(); // zero clientes: não é Infinity
    expect(linha.roas).toBe(0); // gastou e não faturou
  });

  it('separa campanhas e ordena pela que mais trouxe', async () => {
    const { tool } = montar([
      conversa('ad-1', [{ status: 'WON', value: 100 }]),
      conversa('ad-2', [{ status: 'OPEN', value: null }]),
      conversa('ad-2', [{ status: 'OPEN', value: null }]),
      conversa('ad-2', [{ status: 'WON', value: 50 }]),
    ]);

    const r: any = await tool.execute({}, ctx);
    expect(r.output.campanhas.map((c: any) => c.adId)).toEqual(['ad-2', 'ad-1']);
  });

  it('explica o vazio em vez de devolver uma lista muda', async () => {
    const { tool } = montar([]);
    const r: any = await tool.execute({}, ctx);

    expect(r.output.campanhas).toEqual([]);
    expect(r.output.aviso).toContain('Nenhuma conversa com origem de anúncio');
  });

  it('por padrão olha só anúncio; com apenasAnuncios=false inclui orgânico', async () => {
    const { tool, prisma } = montar([]);

    await tool.execute({}, ctx);
    expect(prisma.conversation.findMany.mock.calls[0][0].where.referralSource)
      .toEqual({ in: ['ADS', 'ad'] });

    await tool.execute({ apenasAnuncios: false }, ctx);
    expect(
      prisma.conversation.findMany.mock.calls[1][0].where.referralSource,
    ).toBeUndefined();
  });

  it('limita a janela a 180 dias', async () => {
    const { tool } = montar([]);
    const r: any = await tool.execute({ dias: 9999 }, ctx);
    expect(r.output.periodoDias).toBe(180);
  });
});
