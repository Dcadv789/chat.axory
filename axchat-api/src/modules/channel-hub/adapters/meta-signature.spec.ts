import * as crypto from 'crypto';
import { verifyMetaSignature } from './meta-signature';

const sign = (secret: string, body: Buffer) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

describe('verifyMetaSignature', () => {
  const body = Buffer.from('{"object":"instagram","entry":[{"id":"1"}]}');
  const DO_CANAL = 'segredo-gravado-no-canal';
  const DA_PLATAFORMA = 'segredo-atual-em-integracoes';

  it('aceita quando o segredo do canal assina', () => {
    const headers = { 'x-hub-signature-256': sign(DO_CANAL, body) };
    expect(verifyMetaSignature(headers, body, [DO_CANAL, DA_PLATAFORMA])).toBe(true);
  });

  /**
   * A regressão real: o canal ficou com a cópia velha depois que o App Secret
   * foi trocado em Integrações, e TODA DM do Instagram era descartada.
   */
  it('aceita quando só o segredo ATUAL da plataforma assina (cópia do canal velha)', () => {
    const headers = { 'x-hub-signature-256': sign(DA_PLATAFORMA, body) };
    expect(verifyMetaSignature(headers, body, ['cópia-velha', DA_PLATAFORMA])).toBe(true);
  });

  it('rejeita quando nenhum candidato assina', () => {
    const headers = { 'x-hub-signature-256': sign('de-outro-app', body) };
    expect(verifyMetaSignature(headers, body, [DO_CANAL, DA_PLATAFORMA])).toBe(false);
  });

  it('rejeita corpo adulterado com assinatura válida do corpo original', () => {
    const headers = { 'x-hub-signature-256': sign(DO_CANAL, body) };
    const forjado = Buffer.from('{"object":"instagram","entry":[{"id":"666"}]}');
    expect(verifyMetaSignature(headers, forjado, [DO_CANAL])).toBe(false);
  });

  it('rejeita sem header de assinatura', () => {
    expect(verifyMetaSignature({}, body, [DO_CANAL])).toBe(false);
  });

  it('rejeita quando não há nenhum segredo configurado', () => {
    const headers = { 'x-hub-signature-256': sign(DO_CANAL, body) };
    expect(verifyMetaSignature(headers, body, [undefined, null, '', '  '])).toBe(false);
  });

  // timingSafeEqual lança quando os tamanhos diferem — não pode virar 500.
  it('rejeita assinatura truncada sem lançar', () => {
    const headers = { 'x-hub-signature-256': 'sha256=abc' };
    expect(() => verifyMetaSignature(headers, body, [DO_CANAL])).not.toThrow();
    expect(verifyMetaSignature(headers, body, [DO_CANAL])).toBe(false);
  });

  /**
   * Corpo e assinatura REAIS da DM "Oi" que a Meta entregou em 05/08 e foi
   * rejeitada em produção. O segredo abaixo é fictício, mas a assinatura foi
   * recalculada sobre os bytes exatos que a Meta enviou — se a serialização ou
   * a comparação quebrar, este teste cai.
   */
  it('valida o corpo real do webhook de DM do Instagram', () => {
    const real = Buffer.from(
      '{"object":"instagram","entry":[{"time":1785965233126,"id":"17841458024232453",' +
        '"messaging":[{"sender":{"id":"1259842376154605"},"recipient":{"id":"17841458024232453"},' +
        '"timestamp":1785965231713,"message":{"mid":"aWdfZAG1faXRlbTox","text":"Oi"}}]}]}',
    );
    const headers = { 'x-hub-signature-256': sign(DA_PLATAFORMA, real) };
    expect(verifyMetaSignature(headers, real, ['cópia-velha', DA_PLATAFORMA])).toBe(true);
  });
});
