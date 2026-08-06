import axios from 'axios';
import { InstagramHttpClient } from './instagram.http-client';

jest.mock('axios');
const mocked = axios as jest.Mocked<typeof axios>;

/**
 * Responder comentário só existia como skill da crew de marketing. Um atendente
 * humano via o comentário chegar no inbox e não tinha por onde responder —
 * digitar na caixa normal manda DM, que some do post.
 */
describe('InstagramHttpClient.replyToComment', () => {
  let client: InstagramHttpClient;

  const canal = (config: Record<string, any>) => ({ id: 'ch-1', config }) as any;
  const padrao = {
    graphApi: 'facebook',
    apiVersion: 'v25.0',
    igBusinessId: '17841458024232453',
    accessToken: 'token-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mocked.create.mockReturnValue(mocked as any);
    mocked.post.mockResolvedValue({ data: { id: 'reply-1' } });
  });

  it('posta em /{comment-id}/replies com o texto', async () => {
    client = new InstagramHttpClient();
    const res = await client.replyToComment(canal(padrao), 'comment-9', 'oi!');

    const [url, corpo, opts] = mocked.post.mock.calls[0];
    expect(url).toBe('/comment-9/replies');
    expect(corpo).toBeNull();
    expect((opts as any).params.message).toBe('oi!');
    expect(res).toEqual({ id: 'reply-1' });
  });

  // O motivo da Meta precisa chegar até a UI — "erro ao responder" sozinho não
  // diz se o comentário sumiu, se o token venceu ou se faltou permissão.
  it('propaga a mensagem e o código de erro da Meta', async () => {
    client = new InstagramHttpClient();
    mocked.post.mockRejectedValue({
      response: { data: { error: { message: 'Invalid comment id', code: 100 } } },
    });

    await expect(
      client.replyToComment(canal(padrao), 'comment-x', 'oi'),
    ).rejects.toThrow(/\[#100\] Invalid comment id/);
  });
});
