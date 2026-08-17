import { WhatsAppOfficialMessageMapper } from './whatsapp-official.message-mapper';

/**
 * Click-to-WhatsApp: a Meta manda o `referral` SÓ na primeira mensagem da
 * conversa. Se não for lido ali, a origem do lead some e não há como
 * recuperar depois — nem consultando a API. Por isso o teste existe.
 *
 * Payloads copiados da doc do Cloud API (webhooks → messages → referral).
 */
describe('WhatsApp Official — origem do lead (Click-to-WhatsApp)', () => {
  const mapper = new WhatsAppOfficialMessageMapper();
  const contato = { profile: { name: 'Maria' } };

  const mensagemBase = {
    id: 'wamid.ABC',
    from: '5511999999999',
    timestamp: '1786000000',
    type: 'text',
    text: { body: 'oi, vi o anúncio' },
  };

  it('captura o anúncio que trouxe a pessoa', () => {
    const r = mapper.normalizeInbound(
      {
        ...mensagemBase,
        referral: {
          source_url: 'https://fb.me/xyz',
          source_type: 'ad',
          source_id: '120210000000',
          headline: 'Consultoria Financeira — Maio',
          body: 'Fale com um especialista',
          media_type: 'image',
        },
      },
      contato,
    );

    expect(r?.replyTo?.ad).toEqual({
      id: '120210000000',
      title: 'Consultoria Financeira — Maio',
      source: 'ad',
    });
  });

  it('marca post orgânico como tal — ele é origem, mas não tem custo', () => {
    const r = mapper.normalizeInbound(
      {
        ...mensagemBase,
        referral: {
          source_type: 'post',
          source_id: '178000000000',
          headline: 'Post sobre BPO financeiro',
        },
      },
      contato,
    );

    // Guardar é obrigatório; confundir com anúncio distorceria o custo por
    // lead, porque post orgânico não gastou nada.
    expect(r?.replyTo?.ad?.source).toBe('post');
    expect(r?.replyTo?.ad?.id).toBe('178000000000');
  });

  it('usa o body quando não vem headline', () => {
    const r = mapper.normalizeInbound(
      {
        ...mensagemBase,
        referral: { source_type: 'ad', source_id: '1', body: 'Texto do anúncio' },
      },
      contato,
    );
    expect(r?.replyTo?.ad?.title).toBe('Texto do anúncio');
  });

  it('não inventa origem em mensagem comum', () => {
    const r = mapper.normalizeInbound(mensagemBase, contato);
    expect(r?.replyTo).toBeUndefined();
  });

  it('convive com resposta citada: mantém as duas informações', () => {
    const r = mapper.normalizeInbound(
      {
        ...mensagemBase,
        context: { id: 'wamid.ANTERIOR' },
        referral: { source_type: 'ad', source_id: '999', headline: 'Campanha' },
      },
      contato,
    );

    // Antes o `replyTo` era sobrescrito por quem escrevesse por último.
    expect(r?.replyTo?.externalMessageId).toBe('wamid.ANTERIOR');
    expect(r?.replyTo?.ad?.id).toBe('999');
  });

  it('referral vazio não vira origem fantasma', () => {
    const r = mapper.normalizeInbound(
      { ...mensagemBase, referral: { source_url: 'https://fb.me/x' } },
      contato,
    );
    expect(r?.replyTo?.ad).toBeUndefined();
  });
});
