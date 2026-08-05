import axios from 'axios';
import { InstagramHttpClient } from './instagram.http-client';

jest.mock('axios');
const mocked = axios as jest.Mocked<typeof axios>;

/**
 * Responder no Instagram falhava com "#3 Application does not have the
 * capability to make this API call": no modo Facebook Login o envio é pela
 * PÁGINA, não pela conta IG. A conversa chegava e ninguém conseguia responder.
 */
describe('InstagramHttpClient.sendMessage — para onde o envio vai', () => {
  let client: InstagramHttpClient;
  const payload = { recipient: { id: 'igsid-1' }, message: { text: 'oi' } };

  const canal = (config: Record<string, any>) => ({ id: 'ch-1', config }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new InstagramHttpClient();
    mocked.post.mockResolvedValue({ data: { message_id: 'mid-1' } });
    mocked.create.mockReturnValue(mocked as any);
  });

  it('modo Facebook Login: envia pela PÁGINA, com o page token', async () => {
    await client.sendMessage(
      canal({
        graphApi: 'facebook',
        apiVersion: 'v21.0',
        igBusinessId: '17841458024232453',
        fbPageId: '105844012423899',
        accessToken: 'token-generico',
        pageAccessToken: 'page-token',
      }),
      payload,
    );

    const [url, corpo, opts] = mocked.post.mock.calls[0];
    expect(url).toContain('/105844012423899/messages');
    expect(url).not.toContain('17841458024232453');
    expect(corpo).toEqual(payload);
    expect((opts as any).params.access_token).toBe('page-token');
  });

  it('cai no accessToken do canal quando não há page token separado', async () => {
    await client.sendMessage(
      canal({
        graphApi: 'facebook',
        apiVersion: 'v21.0',
        fbPageId: '105844012423899',
        accessToken: 'token-generico',
      }),
      payload,
    );
    const [, , opts] = mocked.post.mock.calls[0];
    expect((opts as any).params.access_token).toBe('token-generico');
  });

  // Login do Instagram (graph.instagram.com) não tem Página nenhuma.
  it('modo Instagram Login: envia pela própria conta', async () => {
    await client.sendMessage(
      canal({
        graphApi: 'instagram',
        apiVersion: 'v21.0',
        igBusinessId: '17841458024232453',
        accessToken: 'IGAA-token',
      }),
      payload,
    );
    const [url] = mocked.post.mock.calls[0];
    expect(url).toBe('/me/messages');
  });

  // Canal antigo sem fbPageId não pode quebrar: mantém o caminho anterior.
  it('sem fbPageId, mantém o envio pela conta IG', async () => {
    await client.sendMessage(
      canal({
        graphApi: 'facebook',
        apiVersion: 'v21.0',
        igBusinessId: '17841458024232453',
        accessToken: 'token',
      }),
      payload,
    );
    const [url] = mocked.post.mock.calls[0];
    expect(url).toBe('/17841458024232453/messages');
  });
});
