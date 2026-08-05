import { ConflictException } from '@nestjs/common';
import { ChannelsService } from './channels.service';

/**
 * A conta @axorycapital acabou reivindicada por 5 canais em 2 organizações
 * diferentes. Como o webhook da Meta não diz a qual empresa a DM pertence, o
 * roteamento casa pelo igBusinessId e fica com o primeiro canal ativo — ou
 * seja, a org errada passava a receber as mensagens da outra.
 */
describe('ChannelsService.assertInstagramAccountFree', () => {
  const IG = '17841458024232453';
  const ORG = 'org-dona';

  let prisma: { channel: { findFirst: jest.Mock } };
  let service: ChannelsService;
  const call = (igId: string, orgId: string) =>
    (service as any).assertInstagramAccountFree(igId, orgId);

  beforeEach(() => {
    prisma = { channel: { findFirst: jest.fn() } };
    // A guarda só depende do prisma; instanciar via prototype evita arrastar as
    // ~12 dependências do construtor pra um teste que não usa nenhuma delas.
    service = Object.create(ChannelsService.prototype) as ChannelsService;
    (service as any).prisma = prisma;
  });

  it('libera quando a conta ainda não está conectada', async () => {
    prisma.channel.findFirst.mockResolvedValue(null);
    await expect(call(IG, ORG)).resolves.toBeUndefined();
  });

  it('bloqueia quando a conta já está em OUTRA organização', async () => {
    prisma.channel.findFirst.mockResolvedValue({
      name: 'Instagram Axory Capital',
      organizationId: 'outra-org',
    });
    await expect(call(IG, ORG)).rejects.toThrow(ConflictException);
    await expect(call(IG, ORG)).rejects.toThrow(/OUTRA empresa/);
  });

  it('bloqueia duplicata na MESMA organização, citando o canal existente', async () => {
    prisma.channel.findFirst.mockResolvedValue({
      name: 'Instagram Axory Capital',
      organizationId: ORG,
    });
    await expect(call(IG, ORG)).rejects.toThrow(/"Instagram Axory Capital"/);
  });

  it('só considera canais ativos e não excluídos', async () => {
    prisma.channel.findFirst.mockResolvedValue(null);
    await call(IG, ORG);
    expect(prisma.channel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, deletedAt: null }),
      }),
    );
  });

  // Sem id não há o que colidir — não pode barrar a conexão por isso.
  it('não bloqueia quando o igBusinessId vem vazio', async () => {
    await expect(call('', ORG)).resolves.toBeUndefined();
    expect(prisma.channel.findFirst).not.toHaveBeenCalled();
  });
});
