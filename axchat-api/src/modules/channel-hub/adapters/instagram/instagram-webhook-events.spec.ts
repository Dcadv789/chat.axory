import { InstagramInboundAdapter } from './instagram.inbound-adapter';
import { InstagramMessageMapper } from './instagram.message-mapper';
import { MessageContentType } from '../../ports/types';

const IG_ID = '17841458024232453';
const CLIENTE = 'igsid-cliente-1';

/**
 * O parse do webhook só olhava `entry.messaging` com `message`/`delivery`/`read`.
 * Tudo o mais que a Meta manda pro tópico `instagram` era descartado calado:
 * mensagem em standby sumia, clique em botão não voltava e a origem do anúncio
 * (atribuição de campanha) se perdia.
 */
describe('InstagramInboundAdapter.parseWebhook — eventos além do texto', () => {
  let adapter: InstagramInboundAdapter;

  const canal = { id: 'ch-1', config: { igBusinessId: IG_ID } } as any;

  const webhook = (entry: Record<string, any>) => ({
    object: 'instagram',
    entry: [{ id: IG_ID, time: 1_700_000_000, ...entry }],
  });

  beforeEach(() => {
    adapter = new InstagramInboundAdapter(new InstagramMessageMapper());
  });

  describe('standby — outro app com o controle da thread', () => {
    const emStandby = webhook({
      standby: [
        {
          sender: { id: CLIENTE },
          recipient: { id: IG_ID },
          timestamp: 1_700_000_000_000,
          message: { mid: 'mid-standby', text: 'alguém me atende?' },
        },
      ],
    });

    it('registra a mensagem em vez de descartar', () => {
      const { messages } = adapter.parseWebhook(emStandby, canal);
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toBe('alguém me atende?');
      expect(messages[0].externalContactId).toBe(CLIENTE);
    });
  });

  describe('messaging_postbacks — clique em botão / ice breaker', () => {
    const clique = webhook({
      messaging: [
        {
          sender: { id: CLIENTE },
          recipient: { id: IG_ID },
          timestamp: 1_700_000_000_000,
          postback: {
            mid: 'mid-postback',
            title: 'Quero um orçamento',
            payload: 'ORCAMENTO',
          },
        },
      ],
    });

    it('vira mensagem interativa com o payload do botão', () => {
      const { messages } = adapter.parseWebhook(clique, canal);
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(MessageContentType.INTERACTIVE);
      expect(messages[0].content.interactive?.buttonId).toBe('ORCAMENTO');
      expect(messages[0].content.text).toBe('Quero um orçamento');
    });
  });

  describe('messaging_referral — de qual anúncio veio o lead', () => {
    const doAnuncio = webhook({
      messaging: [
        {
          sender: { id: CLIENTE },
          recipient: { id: IG_ID },
          timestamp: 1_700_000_000_000,
          referral: {
            source: 'ADS',
            type: 'OPEN_THREAD',
            ad_id: '120210000000',
            ads_context_data: { ad_title: 'Consultoria Financeira — Maio' },
          },
        },
      ],
    });

    it('guarda o anúncio de origem pra atribuição', () => {
      const { messages } = adapter.parseWebhook(doAnuncio, canal);
      expect(messages).toHaveLength(1);
      expect(messages[0].replyTo?.ad?.id).toBe('120210000000');
      expect(messages[0].replyTo?.ad?.title).toBe('Consultoria Financeira — Maio');
    });

    // Numa conversa NOVA o referral vem grudado no primeiro texto. Os dois
    // precisam sobreviver: a mensagem do cliente e a origem dela.
    it('convive com a mensagem quando chegam no mesmo evento', () => {
      const { messages } = adapter.parseWebhook(
        webhook({
          messaging: [
            {
              sender: { id: CLIENTE },
              recipient: { id: IG_ID },
              timestamp: 1_700_000_000_000,
              message: { mid: 'mid-1', text: 'vi o anúncio' },
              referral: {
                source: 'ADS',
                ad_id: '120210000000',
                ads_context_data: { ad_title: 'Consultoria Financeira — Maio' },
              },
            },
          ],
        }),
        canal,
      );

      expect(messages).toHaveLength(2);
      expect(messages.some((m) => m.content.text === 'vi o anúncio')).toBe(true);
      expect(messages.some((m) => m.replyTo?.ad?.id === '120210000000')).toBe(true);
    });
  });

  describe('message_reactions — curtida na DM', () => {
    const curtiu = (action?: string) =>
      webhook({
        messaging: [
          {
            sender: { id: CLIENTE },
            recipient: { id: IG_ID },
            timestamp: 1_700_000_000_000,
            reaction: { mid: 'mid-alvo', action, reaction: 'love', emoji: '❤️' },
          },
        ],
      });

    it('aponta pra mensagem reagida', () => {
      const { messages } = adapter.parseWebhook(curtiu('react'), canal);
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(MessageContentType.REACTION);
      expect(messages[0].content.reaction?.targetMessageId).toBe('mid-alvo');
      expect(messages[0].content.reaction?.emoji).toBe('❤️');
    });

    it('ignora a retirada da reação', () => {
      const { messages } = adapter.parseWebhook(curtiu('unreact'), canal);
      expect(messages).toHaveLength(0);
    });
  });

  // Este é o gatilho da automação de marketing: o comentário vira mensagem,
  // o processor roteia direto pro worker de comentários e ele responde sozinho.
  // Se os ids não vierem aqui, o agente não tem como responder nem mandar DM.
  describe('comments — comentário em post/reel dispara a automação', () => {
    const comentario = (from: Record<string, any>) =>
      webhook({
        changes: [
          {
            field: 'comments',
            value: {
              id: 'comment-1',
              text: 'entregam em SP?',
              from,
              media: { id: 'media-99' },
            },
          },
        ],
      });

    it('carrega os ids acionáveis do comentário', () => {
      const { messages } = adapter.parseWebhook(
        comentario({ id: 'igsid-autor', username: 'fulano' }),
        canal,
      );

      expect(messages).toHaveLength(1);
      expect(messages[0].comment).toMatchObject({
        commentId: 'comment-1',
        mediaId: 'media-99',
        authorIgsid: 'igsid-autor',
        username: 'fulano',
      });
      expect(messages[0].externalContactId).toBe('igsid-autor');
      expect(messages[0].content.text).toContain('entregam em SP?');
    });

    // Sem isso a resposta do próprio agente voltaria como comentário novo e
    // ele responderia a si mesmo, em loop, publicamente.
    it('ignora o comentário da própria conta', () => {
      const { messages } = adapter.parseWebhook(
        comentario({ id: IG_ID, username: 'axory' }),
        canal,
      );
      expect(messages).toHaveLength(0);
    });

    it('descarta change sem autor ou sem id', () => {
      const { messages } = adapter.parseWebhook(
        webhook({
          changes: [{ field: 'comments', value: { text: 'órfão' } }],
        }),
        canal,
      );
      expect(messages).toHaveLength(0);
    });
  });

  describe('o que já funcionava não pode quebrar', () => {
    it('texto simples segue igual', () => {
      const { messages } = adapter.parseWebhook(
        webhook({
          messaging: [
            {
              sender: { id: CLIENTE },
              recipient: { id: IG_ID },
              timestamp: 1_700_000_000_000,
              message: { mid: 'mid-1', text: 'oi' },
            },
          ],
        }),
        canal,
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toBe('oi');
      expect(messages[0].isEcho).toBeFalsy();
    });

    it('entrega e leitura continuam virando status', () => {
      const { statuses } = adapter.parseWebhook(
        webhook({
          messaging: [
            {
              sender: { id: IG_ID },
              recipient: { id: CLIENTE },
              timestamp: 1_700_000_000_000,
              delivery: { mids: ['mid-1'], watermark: 1_700_000_000_000 },
            },
            {
              sender: { id: IG_ID },
              recipient: { id: CLIENTE },
              timestamp: 1_700_000_000_000,
              read: { watermark: 1_700_000_000_000 },
            },
          ],
        }),
        canal,
      );
      expect(statuses.map((s) => s.status)).toEqual(['delivered', 'read']);
    });

    // Entrada de OUTRA conta IG não pode vazar pro canal errado.
    it('descarta entry de outra conta', () => {
      const { messages } = adapter.parseWebhook(
        {
          object: 'instagram',
          entry: [
            {
              id: 'outra-conta-999',
              time: 1_700_000_000,
              messaging: [
                {
                  sender: { id: CLIENTE },
                  recipient: { id: 'outra-conta-999' },
                  timestamp: 1_700_000_000_000,
                  message: { mid: 'mid-x', text: 'não é meu' },
                },
              ],
            },
          ],
        },
        canal,
      );
      expect(messages).toHaveLength(0);
    });
  });
});
