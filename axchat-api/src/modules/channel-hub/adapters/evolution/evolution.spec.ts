import * as crypto from 'crypto';
import { ChannelType } from '@prisma/client';
import { EvolutionMessageMapper } from './evolution.message-mapper';
import { EvolutionInboundAdapter } from './evolution.inbound-adapter';
import { MessageContentType } from '../../ports/types';

/**
 * WhatsApp não oficial via Evolution.
 *
 * O que se testa aqui é o que falha CALADO: mensagem que chega vazia porque o
 * texto estava noutro campo, webhook aceito sem prova de origem, e formato de
 * payload que muda entre versões do servidor. Nada disso levanta exceção — só
 * produz uma caixa de entrada errada.
 */
describe('Evolution — leitura do que chega', () => {
  const mapper = new EvolutionMessageMapper();

  function upsert(message: any, extra: any = {}) {
    return {
      event: 'messages.upsert',
      instance: 'axchat_canal1',
      data: {
        key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG1' },
        pushName: 'Maria',
        messageTimestamp: 1770000000,
        message,
        ...extra,
      },
    };
  }

  function normalizar(payload: any) {
    const [bruto] = mapper.extrairMensagens(payload);
    return bruto ? mapper.normalizar(bruto) : null;
  }

  // O Baileys guarda o texto em três lugares conforme o caso. Ler só o
  // primeiro faz a mensagem chegar sem texto — o contato aparece na caixa de
  // entrada e o atendente não vê o que ele escreveu.
  it.each([
    ['texto simples', { conversation: 'Bom dia' }, 'Bom dia'],
    ['com citação ou link', { extendedTextMessage: { text: 'Segue o link' } }, 'Segue o link'],
    ['legenda de imagem', { imageMessage: { caption: 'Olha isto', mimetype: 'image/jpeg' } }, 'Olha isto'],
    ['botão respondido', { buttonsResponseMessage: { selectedDisplayText: 'Quero sim' } }, 'Quero sim'],
    ['item de lista', { listResponseMessage: { title: 'Plano ouro' } }, 'Plano ouro'],
  ])('acha o texto em %s', (_caso, message, esperado) => {
    expect(normalizar(upsert(message))?.content.text).toBe(esperado);
  });

  it('marca o tipo certo pra mídia', () => {
    const m = normalizar(upsert({ audioMessage: { mimetype: 'audio/ogg' } }));
    expect(m?.type).toBe(MessageContentType.AUDIO);
  });

  it('converte o horário de segundos, senão a mensagem cai em 1970', () => {
    const m = normalizar(upsert({ conversation: 'oi' }));
    expect(m?.timestamp.getFullYear()).toBe(new Date(1770000000 * 1000).getFullYear());
  });

  it('descarta evento sem nada legível em vez de criar conversa vazia', () => {
    // Mensagem de protocolo do Baileys: existe, mas não tem conteúdo humano.
    expect(normalizar(upsert({ protocolMessage: { type: 'REVOKE' } }))).toBeNull();
  });

  it('mensagem do próprio celular vem marcada como eco', () => {
    const p = upsert({ conversation: 'mandei pelo celular' });
    p.data.key.fromMe = true;
    expect(normalizar(p)?.isEcho).toBe(true);
  });

  it('grupo: o dono da conversa é o grupo, não a pessoa', () => {
    const p = upsert({ conversation: 'oi pessoal' });
    p.data.key.remoteJid = '12345@g.us';
    const m = normalizar(p);
    expect(m?.isGroup).toBe(true);
    expect(m?.externalContactId).toBe('12345@g.us');
  });

  // As versões da Evolution divergem no encaixe. Se só uma for aceita, um
  // upgrade do servidor faz o canal parar de receber respondendo 200 — o
  // webhook "funciona" e nada aparece.
  it('aceita o payload aninhado das outras versões', () => {
    const aninhado = {
      event: 'messages.upsert',
      instance: 'axchat_canal1',
      data: {
        message: {
          key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'M2' },
          message: { conversation: 'veio aninhado' },
          messageTimestamp: 1770000000,
        },
      },
    };
    expect(normalizar(aninhado)?.content.text).toBe('veio aninhado');
  });
});

describe('Evolution — quem pode entregar webhook', () => {
  const SEGREDO = 'a'.repeat(48);

  function adaptador() {
    const conexao = { aplicarEventoDeConexao: jest.fn().mockResolvedValue(undefined) } as any;
    return new EvolutionInboundAdapter(new EvolutionMessageMapper(), conexao);
  }

  it('aceita o token que nós mesmos configuramos na instância', () => {
    expect(
      adaptador().validateWebhook({ 'x-webhook-token': SEGREDO }, Buffer.from(''), SEGREDO),
    ).toBe(true);
  });

  it('recusa token errado', () => {
    expect(
      adaptador().validateWebhook({ 'x-webhook-token': 'b'.repeat(48) }, Buffer.from(''), SEGREDO),
    ).toBe(false);
  });

  it('recusa quando não vem token nenhum', () => {
    expect(adaptador().validateWebhook({}, Buffer.from(''), SEGREDO)).toBe(false);
  });

  it('canal sem segredo recusa — aceitar seria porta aberta', () => {
    // A Evolution não assina o corpo. Sem segredo não sobra NADA provando a
    // origem: qualquer um que descobrisse a URL injetaria mensagem na caixa
    // de entrada de um cliente.
    expect(
      adaptador().validateWebhook({ 'x-webhook-token': SEGREDO }, Buffer.from(''), undefined),
    ).toBe(false);
  });

  it('compara em tempo constante', () => {
    // Com `===`, o tempo de resposta conta quantos caracteres iniciais o
    // atacante acertou, e o segredo sai byte a byte.
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    adaptador().validateWebhook({ 'x-webhook-token': SEGREDO }, Buffer.from(''), SEGREDO);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Evolution — roteamento e conexão', () => {
  function adaptador(conexao: any = { aplicarEventoDeConexao: jest.fn() }) {
    return new EvolutionInboundAdapter(new EvolutionMessageMapper(), conexao);
  }

  it('acha o canal pelo nome da instância', () => {
    const a = adaptador();
    const [loc] = a.extractLocators({ event: 'messages.upsert', instance: 'axchat_c1' });
    expect(loc.instanceId).toBe('axchat_c1');

    const canal = { config: { instanceName: 'axchat_c1' } } as any;
    expect(a.matchesChannel(canal, loc)).toBe(true);
    expect(a.matchesChannel({ config: { instanceName: 'axchat_c2' } } as any, loc)).toBe(false);
  });

  it('não casa canal nenhum quando o payload não diz a instância', () => {
    // Devolver locator vazio faria o resolvedor cair em heurística e entregar
    // a mensagem de um cliente na caixa de outro.
    expect(adaptador().extractLocators({ event: 'messages.upsert' })).toEqual([]);
  });

  it('connection.update não vira mensagem, mas atualiza o canal', () => {
    const conexao = { aplicarEventoDeConexao: jest.fn().mockResolvedValue(undefined) };
    const canal = { id: 'c1', config: {} } as any;

    const r = adaptador(conexao).parseWebhook(
      { event: 'connection.update', instance: 'axchat_c1', data: { state: 'open' } },
      canal,
    );

    expect(r.messages).toHaveLength(0);
    expect(conexao.aplicarEventoDeConexao).toHaveBeenCalledWith(
      canal,
      expect.objectContaining({ event: 'connection.update' }),
    );
  });

  it('o tipo do canal é o não oficial', () => {
    expect(adaptador().channelType).toBe(ChannelType.WHATSAPP_EVOLUTION);
  });
});

describe('Evolution — o que sai', () => {
  const mapper = new EvolutionMessageMapper();

  it('texto vai pro endpoint de texto, com o número limpo', () => {
    const { endpoint, payload } = mapper.desnormalizar(
      { type: MessageContentType.TEXT, content: { text: 'oi' } },
      '5511988887777@s.whatsapp.net',
    );
    expect(endpoint).toBe('/message/sendText');
    expect(payload).toMatchObject({ number: '5511988887777', text: 'oi' });
  });

  it('áudio usa o endpoint de voz, não o de mídia', () => {
    // Por /sendMedia chegaria como arquivo anexado — outra coisa pra quem
    // recebe, que espera a bolha de áudio com o play.
    const { endpoint } = mapper.desnormalizar(
      { type: MessageContentType.AUDIO, content: { mediaUrl: 'https://x/a.ogg' } },
      '5511988887777',
    );
    expect(endpoint).toBe('/message/sendWhatsAppAudio');
  });

  it('resposta a mensagem leva a citação, pra virar bolha nativa', () => {
    const { payload } = mapper.desnormalizar(
      {
        type: MessageContentType.TEXT,
        content: { text: 'respondendo' },
        replyTo: { externalMessageId: 'MSG_ORIGINAL' },
      },
      '5511988887777',
    );
    expect(payload.quoted).toEqual({ key: { id: 'MSG_ORIGINAL' } });
  });
});
