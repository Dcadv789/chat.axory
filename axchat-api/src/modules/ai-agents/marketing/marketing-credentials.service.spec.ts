import { BadRequestException } from '@nestjs/common';
import { MarketingCredentialsService } from './marketing-credentials.service';

/**
 * As credenciais de marketing eram UMA tripla por empresa, e cada conexão nova
 * sobrescrevia a anterior: conectar um segundo Instagram roubava o marketing do
 * primeiro, em silêncio. O inbox sempre separou por canal; aqui não havia
 * separação nenhuma.
 */
describe('MarketingCredentialsService', () => {
  const ORG = 'org-1';
  let prisma: any;
  let config: any;
  let service: MarketingCredentialsService;

  const canal = (over: Record<string, any> = {}) => ({
    id: 'ch-1',
    name: 'Instagram Axory',
    config: {
      igBusinessId: '17841458024232453',
      accessToken: 'token-do-canal',
      fbPageId: '105844012423899',
      igUsername: 'axorycapital',
      adAccountId: '222948316896812',
      adsAccessToken: 'ads-do-canal',
      ...over,
    },
  });

  beforeEach(() => {
    prisma = {
      channel: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      organizationSecret: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    config = { get: jest.fn().mockReturnValue(undefined) };
    service = new MarketingCredentialsService(prisma, config);
  });

  const comSecrets = (map: Record<string, string>) => {
    prisma.organizationSecret.findFirst.mockImplementation(({ where }: any) =>
      map[where.key] ? { value: map[where.key] } : null,
    );
  };

  describe('sem channelId — comportamento antigo', () => {
    it('usa os secrets da organização', async () => {
      comSecrets({ IG_USER_ID: 'ig-org', IG_ACCESS_TOKEN: 'tok-org' });
      const c = await service.resolve(ORG);
      expect(c.source).toBe('org');
      expect(c.igUserId).toBe('ig-org');
      expect(c.igToken).toBe('tok-org');
    });

    it('cai no env quando não há secret', async () => {
      config.get.mockImplementation((k: string) =>
        k === 'IG_USER_ID' ? 'ig-do-env' : undefined,
      );
      expect((await service.resolve(ORG)).igUserId).toBe('ig-do-env');
    });
  });

  describe('com channelId — conta escolhida', () => {
    it('usa as credenciais do canal, não as da organização', async () => {
      prisma.channel.findFirst.mockResolvedValue(canal());
      comSecrets({ IG_USER_ID: 'ig-org', IG_ACCESS_TOKEN: 'tok-org' });

      const c = await service.resolve(ORG, 'ch-1');
      expect(c.source).toBe('channel');
      expect(c.igUserId).toBe('17841458024232453');
      expect(c.igToken).toBe('token-do-canal');
      expect(c.accountName).toBe('Instagram Axory');
    });

    // Ads costuma ser uma conta só por empresa mesmo com vários perfis; se o
    // canal não capturou (permissão em Acesso Padrão), o da org ainda serve.
    it('cai nos ads da organização quando o canal não tem', async () => {
      prisma.channel.findFirst.mockResolvedValue(
        canal({ adAccountId: undefined, adsAccessToken: undefined, userAccessToken: undefined }),
      );
      comSecrets({
        META_AD_ACCOUNT_ID: 'act-org',
        META_ADS_ACCESS_TOKEN: 'ads-org',
      });
      const c = await service.resolve(ORG, 'ch-1');
      expect(c.adAccountId).toBe('act-org');
      expect(c.adsToken).toBe('ads-org');
    });

    it('recusa canal de outra empresa', async () => {
      prisma.channel.findFirst.mockResolvedValue(null);
      await expect(service.resolve(ORG, 'ch-de-outra-org')).rejects.toThrow(
        BadRequestException,
      );
      // O filtro precisa incluir a org — sem isso, uma empresa leria as
      // credenciais de outra passando um id qualquer.
      expect(prisma.channel.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG }),
        }),
      );
    });
  });

  describe('ads()', () => {
    it('remove o prefixo act_ do id guardado', async () => {
      prisma.channel.findFirst.mockResolvedValue(canal({ adAccountId: 'act_123' }));
      expect((await service.ads(ORG, 'ch-1')).acct).toBe('123');
    });

    it('erro cita a conta quando a escolha foi por canal', async () => {
      prisma.channel.findFirst.mockResolvedValue(
        canal({ adAccountId: undefined, adsAccessToken: undefined, userAccessToken: undefined }),
      );
      await expect(service.ads(ORG, 'ch-1')).rejects.toThrow(/Instagram Axory/);
    });
  });

  describe('listAccounts()', () => {
    it('marca quais contas têm anúncios', async () => {
      prisma.channel.findMany.mockResolvedValue([
        canal(),
        { id: 'ch-2', name: 'Segundo', config: { igBusinessId: '2', igUsername: 'dois' } },
      ]);
      const contas = await service.listAccounts(ORG);
      expect(contas.map((c) => c.hasAds)).toEqual([true, false]);
      expect(contas[1].igUsername).toBe('dois');
    });

    it('lista só canais ativos e não excluídos', async () => {
      await service.listAccounts(ORG);
      expect(prisma.channel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true, deletedAt: null }),
        }),
      );
    });
  });
});
