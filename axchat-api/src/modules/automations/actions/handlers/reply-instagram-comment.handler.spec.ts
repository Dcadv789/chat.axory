import { ReplyInstagramCommentHandler } from './reply-instagram-comment.handler';
import { ActionContext } from '../action.types';
import { InstagramCommentPayload } from '../../automations.types';

/**
 * Esta ação publica texto NO PERFIL DO CLIENTE, à vista de todo mundo. Um
 * template mal renderizado não vira log de erro — vira "{{usuario}} obrigado!"
 * embaixo do post dele.
 */
describe('ReplyInstagramCommentHandler', () => {
  let handler: ReplyInstagramCommentHandler;
  let replyToComment: jest.Mock;

  const evento: InstagramCommentPayload = {
    organizationId: 'org-1',
    contactId: 'contato-1',
    conversationId: 'conv-1',
    channelId: 'canal-1',
    messageId: 'msg-1',
    commentId: 'comment-9',
    mediaId: 'media-9',
    authorUsername: 'fulano',
    authorIgsid: 'igsid-1',
    body: 'quanto custa?',
    isReply: false,
  };

  const contexto = (payload: any = evento): ActionContext =>
    ({
      organizationId: 'org-1',
      payload,
      traceId: 't-1',
      cascadeDepth: 1,
      visitedAutomations: [],
      outbox: {} as any,
      prisma: {
        channel: {
          findFirst: jest.fn().mockResolvedValue({ id: 'canal-1', config: {} }),
        },
      } as any,
      actorId: 'user-1',
    }) as ActionContext;

  beforeEach(() => {
    replyToComment = jest.fn().mockResolvedValue({ id: 'reply-1' });
    handler = new ReplyInstagramCommentHandler({ replyToComment } as any);
  });

  describe('validação no salvamento', () => {
    it('exige texto não vazio', () => {
      expect(() => handler.validateParams({})).toThrow(/obrigatório/);
      expect(() => handler.validateParams({ body: '   ' })).toThrow(/obrigatório/);
    });

    it('recusa texto acima do limite do Instagram', () => {
      expect(() => handler.validateParams({ body: 'a'.repeat(2201) })).toThrow(
        /limite/,
      );
    });

    it('aceita texto válido', () => {
      expect(() => handler.validateParams({ body: 'oi!' })).not.toThrow();
    });
  });

  describe('substituição de variáveis', () => {
    it('troca {{usuario}} e {{comentario}}', async () => {
      await handler.execute(
        { body: '{{usuario}} vi seu "{{comentario}}", te chamei no direct!' },
        contexto(),
      );
      expect(replyToComment).toHaveBeenCalledWith(
        expect.anything(),
        'comment-9',
        '@fulano vi seu "quanto custa?", te chamei no direct!',
      );
    });

    // Sem username a Meta não manda nada; deixar "@" solto no post fica feio.
    it('não deixa @ solto quando não há username', async () => {
      await handler.execute(
        { body: '{{usuario}} obrigado!' },
        contexto({ ...evento, authorUsername: null }),
      );
      const [, , texto] = replyToComment.mock.calls[0];
      expect(texto).toBe('obrigado!');
      expect(texto).not.toContain('@');
    });

    it('corta no limite mesmo depois de substituir', async () => {
      await handler.execute(
        { body: '{{comentario}}' },
        contexto({ ...evento, body: 'x'.repeat(3000) }),
      );
      const [, , texto] = replyToComment.mock.calls[0];
      expect(texto.length).toBe(2200);
    });
  });

  describe('guardas', () => {
    // Se alguém arrastar essa ação pra uma automação de "tag adicionada",
    // não há comentário nenhum pra responder.
    it('falha em gatilho sem commentId, sem chamar a Meta', async () => {
      const res = await handler.execute(
        { body: 'oi' },
        contexto({ ...evento, commentId: undefined }),
      );
      expect(res.ok).toBe(false);
      expect(res.errorCode).toBe('invalid_params');
      expect(replyToComment).not.toHaveBeenCalled();
    });

    it('propaga erro da Meta como external_error', async () => {
      replyToComment.mockRejectedValue(new Error('#100 Invalid comment id'));
      const res = await handler.execute({ body: 'oi' }, contexto());
      expect(res.ok).toBe(false);
      expect(res.errorCode).toBe('external_error');
      expect(res.errorMessage).toContain('#100');
    });

    // Falhar aqui não pode impedir as ações de estado (etiquetar, atribuir).
    it('não interrompe a automação por padrão', () => {
      expect(handler.continueOnErrorDefault).toBe(true);
    });
  });
});
