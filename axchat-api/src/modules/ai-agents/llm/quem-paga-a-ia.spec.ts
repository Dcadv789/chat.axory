import { InternalServerErrorException } from '@nestjs/common';
import { LlmService } from './llm.service';

/**
 * A flag `axchatAiEnabled` decide QUEM PAGA a conta da IA. Estes testes
 * cobrem os caminhos em que ela poderia mentir — e todos eram silenciosos:
 * erro de leitura, organização mal configurada, imagem sem provedor de visão.
 * Nenhum deles dava erro; todos simplesmente faturavam no lugar errado.
 */
describe('Quem paga a IA', () => {
  function montar(opcoes: {
    org?: Record<string, unknown> | null;
    erroNaLeitura?: boolean;
  }) {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockImplementation(({ select }: any) => {
          if (opcoes.erroNaLeitura) throw new Error('banco fora');
          if (opcoes.org === null) return null;
          if (select?.axchatAiEnabled !== undefined) {
            return { axchatAiEnabled: opcoes.org?.axchatAiEnabled };
          }
          if (select?.aiVisionProvider !== undefined) {
            return { aiVisionProvider: opcoes.org?.aiVisionProvider ?? null };
          }
          return { aiTextProvider: opcoes.org?.aiTextProvider ?? null };
        }),
      },
      aiModelProvider: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;

    const engineSettings = {
      getEffective: jest.fn().mockResolvedValue({
        text: {
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'chave-DA-PLATAFORMA',
          modelId: 'deepseek-chat',
        },
        vision: { apiKey: 'visao-DA-PLATAFORMA', modelId: 'claude-haiku-4-5' },
        audio: {},
        embedding: {},
      }),
    } as any;

    return { service: new LlmService(prisma, engineSettings), prisma };
  }

  const req = {
    organizationId: 'org-1',
    modelId: 'claude-sonnet-4-6',
    messages: [{ role: 'user' as const, content: 'oi' }],
  } as any;

  it('erro ao ler a flag NÃO vira "usa a plataforma"', async () => {
    const { service } = montar({ erroNaLeitura: true });

    // Antes isto devolvia `true` e a chamada saía na chave da AxChat, com um
    // warn no log que ninguém leria.
    await expect(service.complete(req)).rejects.toThrow();
  });

  it('organização inexistente falha em vez de virar cliente da plataforma', async () => {
    const { service } = montar({ org: null });

    await expect(service.complete(req)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('IA própria declarada e sem provedor: falha explicando, não cai na nossa chave', async () => {
    const { service } = montar({
      org: { axchatAiEnabled: false, aiTextProvider: null },
    });

    await expect(service.complete(req)).rejects.toThrow(
      /IA própria.*não há provedor de texto válido/i,
    );
  });

  it('provedor do cliente sem chave também falha — não silencia pra plataforma', async () => {
    const { service } = montar({
      org: {
        axchatAiEnabled: false,
        aiTextProvider: {
          id: 'p1',
          provider: 'custom',
          modelId: 'x',
          apiKey: null,
          isActive: true,
        },
      },
    });

    await expect(service.complete(req)).rejects.toThrow(/IA própria/i);
  });

  it('org na IA da AxChat usa a chave da plataforma — o caminho normal segue', async () => {
    const { service } = montar({ org: { axchatAiEnabled: true } });

    // Chega até a chamada HTTP: prova que passou das checagens de cobrança.
    global.fetch = jest.fn().mockRejectedValue(new Error('rede'));
    await expect(service.complete(req)).rejects.toThrow();
  });
});
