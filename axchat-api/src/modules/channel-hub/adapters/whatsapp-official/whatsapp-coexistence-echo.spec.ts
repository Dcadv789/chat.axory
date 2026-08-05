import { ChannelType, MessageDirection } from '@prisma/client';
import { WhatsAppOfficialInboundAdapter } from './whatsapp-official.inbound-adapter';
import { WhatsAppOfficialMessageMapper } from './whatsapp-official.message-mapper';

/**
 * Coexistência: o dono responde pelo celular (app WhatsApp Business) e isso
 * sumia da conversa — a tela mostrava só o lado do cliente e o que saía pela
 * plataforma. A Meta entrega essas mensagens em `smb_message_echoes` (novas) e
 * `history` (anteriores à conexão).
 *
 * Formato conferido na doc da Meta:
 * developers.facebook.com → whatsapp/webhooks/reference/smb_message_echoes
 */
describe('WhatsApp coexistência — mensagens enviadas do celular', () => {
  const EMPRESA = '15550783881';
  const CLIENTE = '16505551234';
  let adapter: WhatsAppOfficialInboundAdapter;

  const canal = { id: 'ch-1', config: { phoneNumberId: 'pn-1' } } as any;

  const envelope = (value: Record<string, any>, field = 'smb_message_echoes') => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-1', changes: [{ field, value }] }],
  });

  const meta = {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: EMPRESA, phone_number_id: 'pn-1' },
  };

  beforeEach(() => {
    adapter = new WhatsAppOfficialInboundAdapter(new WhatsAppOfficialMessageMapper());
  });

  describe('smb_message_echoes', () => {
    const eco = envelope({
      ...meta,
      message_echoes: [
        {
          from: EMPRESA,
          to: CLIENTE,
          id: 'wamid.ECO1',
          timestamp: '1739230955',
          type: 'text',
          text: { body: 'respondi pelo celular' },
        },
      ],
    });

    it('vira mensagem da conversa do CLIENTE, não da empresa', () => {
      const { messages } = adapter.parseWebhook(eco, canal);
      expect(messages).toHaveLength(1);
      // O erro fácil aqui é usar `from`, que é o número da própria empresa —
      // criaria um contato com o número do negócio e uma conversa fantasma.
      expect(messages[0].externalContactId).toBe(CLIENTE);
      expect(messages[0].externalMessageId).toBe('wamid.ECO1');
    });

    it('é marcada como eco, pra virar OUTBOUND no pipeline', () => {
      const { messages } = adapter.parseWebhook(eco, canal);
      expect(messages[0].isEcho).toBe(true);
    });

    it('preserva o conteúdo e o horário reais', () => {
      const { messages } = adapter.parseWebhook(eco, canal);
      expect((messages[0].content as any).text).toBe('respondi pelo celular');
      expect(messages[0].timestamp).toEqual(new Date(1739230955 * 1000));
    });
  });

  describe('history (conversas anteriores à conexão)', () => {
    const historico = envelope(
      {
        ...meta,
        history: [
          {
            metadata: { phase: 0, chunk_order: 1, progress: 55 },
            threads: [
              {
                id: CLIENTE,
                messages: [
                  {
                    from: EMPRESA,
                    id: 'wamid.H1',
                    timestamp: '1739230000',
                    type: 'text',
                    text: { body: 'mandei antes de conectar' },
                  },
                  {
                    from: CLIENTE,
                    id: 'wamid.H2',
                    timestamp: '1739230100',
                    type: 'text',
                    text: { body: 'cliente respondeu' },
                  },
                ],
              },
            ],
          },
        ],
      },
      'history',
    );

    // No history não existe `to`: a direção sai de comparar `from` com o
    // número da empresa. Errar isso inverte o histórico inteiro.
    it('separa o que a empresa mandou do que o cliente mandou', () => {
      const { messages } = adapter.parseWebhook(historico, canal);
      expect(messages).toHaveLength(2);

      const daEmpresa = messages.find((m) => m.externalMessageId === 'wamid.H1')!;
      const doCliente = messages.find((m) => m.externalMessageId === 'wamid.H2')!;

      expect(daEmpresa.isEcho).toBe(true);
      expect(daEmpresa.externalContactId).toBe(CLIENTE);
      expect(doCliente.isEcho).toBeFalsy();
      expect(doCliente.externalContactId).toBe(CLIENTE);
    });

    // `display_phone_number` vem formatado e às vezes SEM o código de país que
    // o `from` traz. Igualdade exata inverteria o histórico inteiro.
    it.each([
      ['máscara com separadores', '+1 555-078-3881'],
      ['sem código de país', '5550783881'],
      ['com espaços e parênteses', '+1 (555) 078 3881'],
    ])('reconhece o número da empresa: %s', (_caso, display) => {
      const comMascara = envelope(
        {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: display, phone_number_id: 'pn-1' },
          history: [
            {
              threads: [
                {
                  id: CLIENTE,
                  messages: [
                    { from: EMPRESA, id: 'wamid.H3', timestamp: '1739230000', type: 'text', text: { body: 'oi' } },
                  ],
                },
              ],
            },
          ],
        },
        'history',
      );
      const { messages } = adapter.parseWebhook(comMascara, canal);
      expect(messages[0].isEcho).toBe(true);
    });
  });

  describe('o que já funcionava não pode quebrar', () => {
    it('mensagem recebida do cliente segue igual', () => {
      const entrada = envelope({
        ...meta,
        contacts: [{ wa_id: CLIENTE, profile: { name: 'Fulano' } }],
        messages: [
          {
            from: CLIENTE,
            id: 'wamid.IN1',
            timestamp: '1739230955',
            type: 'text',
            text: { body: 'oi, tudo bem?' },
          },
        ],
      }, 'messages');

      const { messages } = adapter.parseWebhook(entrada, canal);
      expect(messages).toHaveLength(1);
      expect(messages[0].externalContactId).toBe(CLIENTE);
      expect(messages[0].contactName).toBe('Fulano');
      expect(messages[0].isEcho).toBeFalsy();
      expect(messages[0].channelType).toBe(ChannelType.WHATSAPP_OFFICIAL);
    });

    it('status de entrega segue igual', () => {
      const st = envelope({
        ...meta,
        statuses: [{ id: 'wamid.OUT1', status: 'delivered', timestamp: '1739230955' }],
      }, 'messages');
      const { statuses, messages } = adapter.parseWebhook(st, canal);
      expect(messages).toHaveLength(0);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('delivered');
    });

    it('payload sem os campos novos não gera nada a mais', () => {
      const { messages } = adapter.parseWebhook(
        envelope({ ...meta, messages: [] }, 'messages'),
        canal,
      );
      expect(messages).toHaveLength(0);
    });

    // Escopo por phone_number_id continua valendo pros campos novos.
    it('descarta eco de outro número da mesma conta', () => {
      const outro = envelope({
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: EMPRESA, phone_number_id: 'OUTRO-pn' },
        message_echoes: [
          { from: EMPRESA, to: CLIENTE, id: 'wamid.X', timestamp: '1739230955', type: 'text', text: { body: 'x' } },
        ],
      });
      expect(adapter.parseWebhook(outro, canal).messages).toHaveLength(0);
    });
  });

  it('eco sem destinatário é descartado em vez de virar contato inválido', () => {
    const semTo = envelope({
      ...meta,
      message_echoes: [
        { from: EMPRESA, id: 'wamid.SEMTO', timestamp: '1739230955', type: 'text', text: { body: 'x' } },
      ],
    });
    expect(adapter.parseWebhook(semTo, canal).messages).toHaveLength(0);
  });
});
