import { EmbeddingsService } from './embeddings.service';
import { VectorStoreService } from './vector-store.service';

/**
 * O risco que estes testes cobrem não dá erro: dá resultado errado em silêncio.
 *
 * Vetores de modelos diferentes vivem em espaços diferentes —
 * `text-embedding-3-small` tem 1536 dimensões, o `text-embedding-004` do
 * Google tem 768. Calcular cosseno entre eles devolve um número, e número
 * nenhum reclama. A busca passaria a trazer trechos aleatórios e ninguém
 * ligaria isso à troca de provedor feita semanas antes.
 */
describe('Embedding por provedor', () => {
  describe('slot de configuração', () => {
    function montar(embedding: Record<string, string | null>) {
      const engineSettings = {
        getEffective: jest.fn().mockResolvedValue({
          text: {},
          vision: {},
          audio: {
            apiKey: 'chave-de-audio',
            baseUrl: 'https://api.openai.com/v1',
          },
          embedding,
        }),
      } as any;
      return new EmbeddingsService(engineSettings);
    }

    it('usa o slot de embedding, não o de áudio', async () => {
      const service = montar({
        apiKey: 'chave-do-google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        modelId: 'text-embedding-004',
      });

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2], index: 0 }],
          usage: { total_tokens: 5 },
        }),
      });
      global.fetch = fetchMock as any;

      const r = await service.embed('texto qualquer');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/openai/embeddings',
      );
      // A chave de áudio não pode vazar pra cá: são serviços diferentes e
      // podem ser de provedores diferentes.
      expect(init.headers.Authorization).toBe('Bearer chave-do-google');
      expect(JSON.parse(init.body).model).toBe('text-embedding-004');
      // O modelo volta no resultado — é o que carimba o vetor.
      expect(r.model).toBe('text-embedding-004');
    });

    it('cai num modelo padrão quando o slot não define', async () => {
      const service = montar({ apiKey: 'k', baseUrl: null, modelId: null });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: [1], index: 0 }],
          usage: { total_tokens: 1 },
        }),
      }) as any;

      const r = await service.embed('x');
      expect(r.model).toBe('text-embedding-3-small');
    });
  });

  describe('busca ignora vetor de outro modelo', () => {
    function montar() {
      const prisma = {
        aiVectorEntry: {
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn().mockResolvedValue({}),
        },
      } as any;
      return { store: new VectorStoreService(prisma), prisma };
    }

    it('filtra pelo modelo atual', async () => {
      const { store, prisma } = montar();

      await store.search([0.1, 0.2], {
        agentId: 'ag-1',
        embeddingModel: 'text-embedding-004',
      });

      expect(prisma.aiVectorEntry.findMany.mock.calls[0][0].where).toMatchObject(
        { agentId: 'ag-1', embeddingModel: 'text-embedding-004' },
      );
    });

    it('sem modelo declarado, não filtra — preserva o comportamento antigo', async () => {
      const { store, prisma } = montar();

      await store.search([0.1], { agentId: 'ag-1' });

      expect(
        prisma.aiVectorEntry.findMany.mock.calls[0][0].where.embeddingModel,
      ).toBeUndefined();
    });

    it('grava o modelo junto do vetor', async () => {
      const { store, prisma } = montar();

      await store.upsert({
        id: 'v1',
        ownerType: 'message',
        ownerId: 'm1',
        content: 'oi',
        embedding: [0.1],
        embeddingModel: 'text-embedding-004',
      } as any);

      expect(prisma.aiVectorEntry.upsert.mock.calls[0][0].create).toMatchObject({
        embeddingModel: 'text-embedding-004',
      });
    });
  });
});
