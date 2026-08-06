import { InstagramMessageMapper } from './instagram.message-mapper';
import { MessageContentType, NormalizedOutboundMessage } from '../../ports/types';

const CONTATO = 'igsid-cliente-1';
const HORA = 60 * 60 * 1000;

/**
 * A Meta só aceita resposta livre dentro de 24h da última mensagem do cliente.
 * Entre 24h e 7 dias, só um ATENDENTE HUMANO responde, e só com a tag
 * HUMAN_AGENT. A política proíbe expressamente a tag em mensagem automática —
 * então a IA nunca pode recebê-la, mesmo que isso signifique o envio falhar.
 */
describe('InstagramMessageMapper.denormalize — janela de envio', () => {
  let mapper: InstagramMessageMapper;

  const texto = (
    sendWindow?: NormalizedOutboundMessage['sendWindow'],
  ): NormalizedOutboundMessage => ({
    type: MessageContentType.TEXT,
    content: { text: 'oi' },
    sendWindow,
  });

  const atras = (ms: number) => new Date(Date.now() - ms);

  beforeEach(() => {
    mapper = new InstagramMessageMapper();
  });

  it('dentro de 24h: resposta normal, sem tag', () => {
    const payload = mapper.denormalize(
      texto({ lastInboundAt: atras(2 * HORA), fromHumanAgent: true }),
      CONTATO,
    );
    expect(payload.messaging_type).toBe('RESPONSE');
    expect(payload.tag).toBeUndefined();
  });

  it('fora de 24h com atendente humano: usa HUMAN_AGENT', () => {
    const payload = mapper.denormalize(
      texto({ lastInboundAt: atras(30 * HORA), fromHumanAgent: true }),
      CONTATO,
    );
    expect(payload.messaging_type).toBe('MESSAGE_TAG');
    expect(payload.tag).toBe('HUMAN_AGENT');
  });

  // O ponto mais importante do arquivo: marcar automático como humano é
  // violação de política e pode custar o direito de enviar mensagem.
  it('fora de 24h com mensagem da IA: NUNCA marca HUMAN_AGENT', () => {
    const payload = mapper.denormalize(
      texto({ lastInboundAt: atras(30 * HORA), fromHumanAgent: false }),
      CONTATO,
    );
    expect(payload.messaging_type).toBe('RESPONSE');
    expect(payload.tag).toBeUndefined();
  });

  it('sem contexto de janela: cai no caminho conservador', () => {
    const payload = mapper.denormalize(texto(), CONTATO);
    expect(payload.messaging_type).toBe('RESPONSE');
    expect(payload.tag).toBeUndefined();
  });

  it('vale também pra mídia, não só texto', () => {
    const payload = mapper.denormalize(
      {
        type: MessageContentType.IMAGE,
        content: { mediaUrl: 'https://cdn.axory.com.br/a.jpg' },
        sendWindow: { lastInboundAt: atras(48 * HORA), fromHumanAgent: true },
      },
      CONTATO,
    );
    expect(payload.messaging_type).toBe('MESSAGE_TAG');
    expect(payload.tag).toBe('HUMAN_AGENT');
    expect(payload.message.attachment.type).toBe('image');
  });

  it('mantém o destinatário e o conteúdo intactos', () => {
    const payload = mapper.denormalize(texto(), CONTATO);
    expect(payload.recipient).toEqual({ id: CONTATO });
    expect(payload.message.text).toBe('oi');
  });
});
