import { CardActivityService } from './card-activity.service';

/**
 * O histórico existe pra responder "quem moveu isso?".
 *
 * Com IA e automação mexendo no funil, um histórico que só registra pessoa
 * mente por omissão — o card pareceria ter andado sozinho, e a primeira
 * pergunta de quem audita fica sem resposta.
 */
describe('Histórico do card', () => {
  function montar() {
    const prisma = {
      cardActivity: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
      card: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      aiAgent: { findMany: jest.fn().mockResolvedValue([]) },
      pipelineStage: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    return { service: new CardActivityService(prisma), prisma };
  }

  it('guarda o autor no campo certo — humano', async () => {
    const { service, prisma } = montar();

    await service.registrar({
      cardId: 'c1',
      tipo: 'MOVIDO',
      por: { origem: 'HUMANO', userId: 'u1' },
    });

    const d = prisma.cardActivity.create.mock.calls[0][0].data;
    expect(d).toMatchObject({ origem: 'HUMANO', userId: 'u1' });
    // Os outros dois ficam nulos: nada de guardar id de agente num movimento
    // que foi de gente.
    expect(d.agentId).toBeNull();
    expect(d.automationId).toBeNull();
  });

  it('guarda o autor no campo certo — IA', async () => {
    const { service, prisma } = montar();

    await service.registrar({
      cardId: 'c1',
      tipo: 'GANHO',
      por: { origem: 'IA', agentId: 'ag-1' },
    });

    const d = prisma.cardActivity.create.mock.calls[0][0].data;
    expect(d).toMatchObject({ origem: 'IA', agentId: 'ag-1' });
    expect(d.userId).toBeNull();
  });

  it('guarda o autor no campo certo — automação', async () => {
    const { service, prisma } = montar();

    await service.registrar({
      cardId: 'c1',
      tipo: 'CRIADO',
      por: { origem: 'AUTOMACAO', automationId: 'a-1' },
    });

    const d = prisma.cardActivity.create.mock.calls[0][0].data;
    expect(d).toMatchObject({ origem: 'AUTOMACAO', automationId: 'a-1' });
    expect(d.userId).toBeNull();
    expect(d.agentId).toBeNull();
  });

  it('falha em silêncio: registrar não pode travar o movimento do card', async () => {
    const { service, prisma } = montar();
    prisma.cardActivity.create.mockRejectedValue(new Error('banco fora'));

    // O que o usuário fez tem que valer mesmo se o log falhar.
    await expect(
      service.registrar({ cardId: 'c1', tipo: 'MOVIDO', por: { origem: 'HUMANO' } }),
    ).resolves.toBeUndefined();
  });

  it('card de outra organização não devolve histórico', async () => {
    const { service, prisma } = montar();
    prisma.card.findFirst.mockResolvedValue(null);

    const r = await service.listar('org-1', 'card-de-outro-tenant');

    expect(r).toEqual([]);
    expect(prisma.cardActivity.findMany).not.toHaveBeenCalled();
  });

  it('resolve os nomes: a tela não deveria fazer quatro consultas pra escrever "Maria moveu"', async () => {
    const { service, prisma } = montar();
    prisma.cardActivity.findMany.mockResolvedValue([
      {
        id: 'a1',
        tipo: 'MOVIDO',
        origem: 'HUMANO',
        userId: 'u1',
        agentId: null,
        fromStageId: 's1',
        toStageId: 's2',
        descricao: null,
        createdAt: new Date(),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Maria' }]);
    prisma.pipelineStage.findMany.mockResolvedValue([
      { id: 's1', name: 'Novo lead' },
      { id: 's2', name: 'Em conversa' },
    ]);

    const [item] = await service.listar('org-1', 'c1');

    expect(item.quem).toBe('Maria');
    expect(item.de).toBe('Novo lead');
    expect(item.para).toBe('Em conversa');
  });

  it('autor apagado não quebra a linha do tempo', async () => {
    const { service, prisma } = montar();
    prisma.cardActivity.findMany.mockResolvedValue([
      {
        id: 'a1',
        tipo: 'CRIADO',
        origem: 'AUTOMACAO',
        userId: null,
        agentId: null,
        fromStageId: null,
        toStageId: null,
        descricao: null,
        createdAt: new Date(),
      },
    ]);

    const [item] = await service.listar('org-1', 'c1');

    // A regra pode ter sido apagada depois — "Automação" é honesto.
    expect(item.quem).toBe('Automação');
  });
});
