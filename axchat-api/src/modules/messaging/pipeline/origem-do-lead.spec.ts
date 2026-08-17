import { OrigemDoLeadService } from './origem-do-lead.service';

/**
 * A regra que estes testes protegem é o PRIMEIRO TOQUE.
 *
 * Um cliente que volta clicando em outro anúncio reescreveria a própria origem
 * — e a atribuição do anúncio que realmente o trouxe se perderia. Como isso só
 * aparece semanas depois, num relatório de custo por lead que ninguém consegue
 * explicar, o teste existe pra travar a regra agora.
 */
describe('OrigemDoLeadService', () => {
  function montar() {
    const prisma = {
      conversation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as any;
    return { service: new OrigemDoLeadService(prisma), prisma };
  }

  describe('extrair', () => {
    it('lê o anúncio do replyTo normalizado', () => {
      const { service } = montar();
      expect(
        service.extrair({ ad: { id: '120210000000', title: 'Consultoria' } }),
      ).toEqual({ adId: '120210000000', adTitle: 'Consultoria' });
    });

    it('devolve null quando a mensagem não veio de anúncio', () => {
      const { service } = montar();
      expect(service.extrair(null)).toBeNull();
      expect(service.extrair({})).toBeNull();
      expect(service.extrair({ ad: {} })).toBeNull();
      // resposta a uma mensagem comum, sem anúncio nenhum
      expect(service.extrair({ messageId: 'abc' })).toBeNull();
    });

    it('aceita anúncio só com título — nem sempre vem o id', () => {
      const { service } = montar();
      expect(service.extrair({ ad: { title: 'Campanha de maio' } })).toEqual({
        adId: undefined,
        adTitle: 'Campanha de maio',
      });
    });
  });

  describe('registrar', () => {
    it('só grava onde ainda não há origem — é isso que faz o primeiro toque', async () => {
      const { service, prisma } = montar();

      await service.registrar('conv-1', { adId: 'ad-1', adTitle: 'Maio' });

      const chamada = prisma.conversation.updateMany.mock.calls[0][0];
      // O filtro por adId:null é o mecanismo: quem chega depois não acha
      // linha pra atualizar. Sem ele, o último anúncio venceria.
      expect(chamada.where).toEqual({ id: 'conv-1', adId: null });
      expect(chamada.data.adId).toBe('ad-1');
    });

    it('não toca no banco quando não há anúncio', async () => {
      const { service, prisma } = montar();
      await service.registrar('conv-1', null);
      await service.registrar('conv-1', {});
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('falha em silêncio: atribuição nunca derruba a entrega da mensagem', async () => {
      const { service, prisma } = montar();
      prisma.conversation.updateMany.mockRejectedValue(new Error('banco fora'));

      await expect(
        service.registrar('conv-1', { adId: 'ad-1' }),
      ).resolves.toBeUndefined();
    });
  });
});
