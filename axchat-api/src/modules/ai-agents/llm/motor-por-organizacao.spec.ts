import { LlmService } from './llm.service';

/**
 * Quem paga a conta da IA.
 *
 * A organização tem uma flag dizendo se usa a IA da AxChat ou a dela. Quando é
 * a dela, a escolha de provedor saía do `modelId` salvo no agente casando com
 * o nome de um provedor registrado — e quando não casava, a chamada caía na
 * chave da AxChat SEM AVISO. A empresa dizia "pago minha IA" e a plataforma
 * pagava a conta, sem erro nenhum no caminho.
 *
 * Agora a organização aponta o provedor, e o modelo vem dele.
 */
describe('Motor por organização — quem paga a conta', () => {
  function montar(org: Record<string, unknown>, provedorPorModelo?: unknown) {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockImplementation(({ select }: any) =>
          select?.axchatAiEnabled !== undefined
            ? { axchatAiEnabled: org.axchatAiEnabled }
            : { aiTextProvider: org.aiTextProvider ?? null },
        ),
      },
      aiModelProvider: {
        findUnique: jest.fn().mockResolvedValue(provedorPorModelo ?? null),
      },
    } as any;

    const service = new LlmService(prisma, { getEffective: jest.fn() } as any);
    return { service, prisma };
  }

  const provedorDoCliente = {
    id: 'prov-1',
    provider: 'custom',
    modelId: 'deepseek-chat',
    apiKey: 'chave-do-cliente',
    baseUrl: 'https://api.deepseek.com',
    isActive: true,
  };

  it('org na IA da AxChat ignora provedor próprio', async () => {
    const { service } = montar({ axchatAiEnabled: true });

    const r = await (service as any).resolveOrgModel('org-1', 'qualquer');

    expect(r).toBeUndefined();
  });

  it('usa o provedor APONTADO pela organização, não o modelo do agente', async () => {
    const { service, prisma } = montar({
      axchatAiEnabled: false,
      aiTextProvider: provedorDoCliente,
    });

    const r = await (service as any).resolveOrgModel(
      'org-1',
      'claude-sonnet-4-6', // o que está salvo no agente
    );

    expect(r.transport).toBe('openai-compat');
    // O modelo é o do provedor escolhido — o do agente não manda mais.
    expect(r.modelId).toBe('deepseek-chat');
    // Nem precisou procurar por nome de modelo.
    expect(prisma.aiModelProvider.findUnique).not.toHaveBeenCalled();
  });

  it('sem provedor apontado, cai no casamento por nome — quem já rodava assim continua', async () => {
    const { service, prisma } = montar(
      { axchatAiEnabled: false, aiTextProvider: null },
      provedorDoCliente,
    );

    const r = await (service as any).resolveOrgModel('org-1', 'deepseek-chat');

    expect(r.modelId).toBe('deepseek-chat');
    expect(prisma.aiModelProvider.findUnique).toHaveBeenCalled();
  });

  it('provedor inativo não vale, mesmo apontado', async () => {
    const { service } = montar({
      axchatAiEnabled: false,
      aiTextProvider: { ...provedorDoCliente, isActive: false },
    });

    const r = await (service as any).resolveOrgModel('org-1', 'deepseek-chat');

    expect(r).toBeUndefined();
  });

  it('provedor sem chave não vale — evita chamar endpoint sem credencial', async () => {
    const { service } = montar({
      axchatAiEnabled: false,
      aiTextProvider: { ...provedorDoCliente, apiKey: null },
    });

    const r = await (service as any).resolveOrgModel('org-1', 'deepseek-chat');

    expect(r).toBeUndefined();
  });
});
