import { BadRequestException } from '@nestjs/common';
import { ChannelsService } from './channels.service';

/**
 * Reconectar existe pra renovar credencial de um canal que já tem histórico.
 * O risco é o oposto do que parece: não é falhar, é dar CERTO com a conta
 * errada — o operador escolhe outro perfil no popup e o canal, com todas as
 * conversas dele, passa a apontar pra lá sem nenhum aviso.
 */
describe('ChannelsService — reconexão do Instagram', () => {
  const IG = '17841458024232453';
  const OUTRA = '999999999999999';

  let service: ChannelsService;
  let update: jest.Mock;
  let subscribeApp: jest.Mock;
  let persistSecrets: jest.Mock;

  const reconectar = (igDoLogin: string, configAtual: Record<string, any>) =>
    service.createFromInstagramFacebookLogin(
      'org-1',
      { code: 'codigo-do-popup' } as any,
      undefined,
      { id: 'ch-1', config: configAtual },
    );

  beforeEach(() => {
    update = jest.fn().mockImplementation(({ data }) => ({ id: 'ch-1', ...data }));
    subscribeApp = jest.fn().mockResolvedValue({ ok: true });
    persistSecrets = jest.fn().mockResolvedValue({ adsConnected: false });

    service = Object.create(ChannelsService.prototype) as ChannelsService;
    const s = service as any;
    s.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    s.prisma = { channel: { update } };
    s.persistInstagramOrgSecrets = persistSecrets;
    s.loadMetaCoexistenceConfig = jest.fn().mockResolvedValue({
      appId: 'app', appSecret: 'sec', instagramAppId: '', instagramAppSecret: '',
      instagramConfigId: 'cfg-1',
    });
    s.resolveInstagramApp = jest
      .fn()
      .mockReturnValue({ igAppId: 'ig-app', igAppSecret: 'ig-secret' });
    s.instagramHttpClient = {
      exchangeCodeForToken: jest.fn().mockResolvedValue('token-de-usuario'),
      subscribeApp,
      listManagedPagesWithInstagram: jest.fn(),
    };
  });

  /** Faz o popup "devolver" uma conta específica. */
  const loginTraz = (igBusinessId: string) => {
    (service as any).instagramHttpClient.listManagedPagesWithInstagram = jest
      .fn()
      .mockResolvedValue([
        {
          pageId: '105844012423899',
          pageName: 'Axory Capital',
          pageAccessToken: 'page-token-novo',
          igBusinessId,
          igUsername: 'projeto.jao',
        },
      ]);
  };

  it('recusa quando o login trouxe OUTRA conta do Instagram', async () => {
    loginTraz(OUTRA);
    await expect(reconectar(OUTRA, { igBusinessId: IG })).rejects.toThrow(
      BadRequestException,
    );
    await expect(reconectar(OUTRA, { igBusinessId: IG })).rejects.toThrow(
      /outra conta do Instagram/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('grava as credenciais novas quando é a mesma conta', async () => {
    loginTraz(IG);
    await reconectar(IG, { igBusinessId: IG, accessToken: 'token-velho' });

    const cfg = update.mock.calls[0][0].data.config;
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ch-1' } }),
    );
    expect(cfg.accessToken).toBe('page-token-novo');
    expect(cfg.pageAccessToken).toBe('page-token-novo');
    expect(cfg.userAccessToken).toBe('token-de-usuario');
    // O appSecret precisa ser o do app do INSTAGRAM: é ele que assina os
    // webhooks, e um secret errado aqui rejeita todas as DMs.
    expect(cfg.appSecret).toBe('ig-secret');
  });

  it('preserva os campos do canal que o login não traz', async () => {
    loginTraz(IG);
    await reconectar(IG, { igBusinessId: IG, apiVersion: 'v25.0', graphApi: 'facebook' });

    const cfg = update.mock.calls[0][0].data.config;
    expect(cfg.apiVersion).toBe('v25.0');
    expect(cfg.graphApi).toBe('facebook');
  });

  it('reativa o canal e reinscreve os webhooks', async () => {
    loginTraz(IG);
    await reconectar(IG, { igBusinessId: IG });
    expect(update.mock.calls[0][0].data.isActive).toBe(true);
    expect(subscribeApp).toHaveBeenCalled();
  });

  // Canal antigo sem o id gravado não pode ficar impossível de reconectar.
  it('aceita quando o canal ainda não tinha igBusinessId', async () => {
    loginTraz(IG);
    await reconectar(IG, { accessToken: 'token-velho' });
    expect(update).toHaveBeenCalled();
  });

  // Falha em inscrever webhook não pode desfazer a credencial já renovada.
  it('não derruba a reconexão se o subscribeApp falhar', async () => {
    loginTraz(IG);
    subscribeApp.mockRejectedValue(new Error('#200 sem permissão'));
    await expect(reconectar(IG, { igBusinessId: IG })).resolves.toBeDefined();
    expect(update).toHaveBeenCalled();
  });
});
