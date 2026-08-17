import { BadRequestException } from '@nestjs/common';
import { AgentsService } from './agents.service';

/**
 * A trava do prompt de agente do produto.
 *
 * Ela vive no serviço, e não só na tela, por um motivo simples: o endpoint
 * aceita PATCH de quem tiver token. Uma interface que esconde o campo não
 * impede ninguém de mandar a requisição na mão — e o dia em que alguém fizer
 * isso, o agente vendido vira uma versão só daquele cliente, que não recebe
 * mais nenhuma melhoria nossa.
 */
describe('Agente do produto — trava do prompt', () => {
  function montar(agente: Record<string, unknown>) {
    const prisma = {
      aiAgent: {
        findFirst: jest.fn().mockResolvedValue(agente),
        update: jest.fn().mockResolvedValue({ ...agente, ok: true }),
      },
    } as any;
    const service = new AgentsService(prisma, {} as any);
    return { service, prisma };
  }

  const gerenciado = {
    id: 'ag-1',
    name: 'Magnus',
    isManaged: true,
    systemPrompt: 'Você é Magnus, orquestrador da crew.',
    operationalContext: null,
  };

  const doCliente = {
    id: 'ag-2',
    name: 'Agente do cliente',
    isManaged: false,
    systemPrompt: 'Texto original',
    operationalContext: null,
  };

  it('recusa o cliente reescrevendo o prompt de um agente do produto', async () => {
    const { service, prisma } = montar(gerenciado);

    await expect(
      service.update('org-1', 'ag-1', { systemPrompt: 'texto novo' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.aiAgent.update).not.toHaveBeenCalled();
  });

  it('a mensagem ensina a saída, em vez de só barrar', async () => {
    const { service } = montar(gerenciado);

    await expect(
      service.update('org-1', 'ag-1', { systemPrompt: 'outro' } as any),
    ).rejects.toThrow(/Instruções adicionais/);
  });

  it('deixa passar o MESMO texto: a tela reenvia o campo sem alteração', async () => {
    const { service, prisma } = montar(gerenciado);

    // Um formulário que manda o objeto inteiro no salvar não pode quebrar só
    // porque incluiu o prompt inalterado no corpo.
    await service.update('org-1', 'ag-1', {
      systemPrompt: gerenciado.systemPrompt,
      temperature: 0.5,
    } as any);

    expect(prisma.aiAgent.update).toHaveBeenCalled();
  });

  it('super-admin edita: é quem mantém o produto', async () => {
    const { service, prisma } = montar(gerenciado);

    await service.update('org-1', 'ag-1', { systemPrompt: 'novo' } as any, true);

    expect(prisma.aiAgent.update).toHaveBeenCalled();
  });

  it('agente criado pelo cliente é editável por completo', async () => {
    const { service, prisma } = montar(doCliente);

    await service.update('org-1', 'ag-2', {
      systemPrompt: 'reescrevi tudo',
    } as any);

    expect(prisma.aiAgent.update).toHaveBeenCalled();
  });

  it('instruções adicionais passam mesmo em agente do produto', async () => {
    const { service, prisma } = montar(gerenciado);

    await service.update('org-1', 'ag-1', {
      additionalInstructions: 'Priorize BPO contábil neste trimestre.',
    } as any);

    expect(prisma.aiAgent.update).toHaveBeenCalled();
  });
});
