import * as crypto from 'crypto';
import { parseMetaSignedRequest } from './meta-signed-request';

const SEGREDO = 'app-secret-do-threads';

function assinar(payload: Record<string, unknown>, secret = SEGREDO): string {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = crypto
    .createHmac('sha256', secret)
    .update(corpo)
    .digest('base64url');
  return `${assinatura}.${corpo}`;
}

/**
 * O callback de desautorização desliga o canal do cliente. Aceitar um
 * signed_request forjado deixaria qualquer um derrubar canal alheio sabendo só
 * o user_id — que não é segredo.
 */
describe('parseMetaSignedRequest', () => {
  const valido = { user_id: '17841400000000000', algorithm: 'HMAC-SHA256' };

  it('abre o payload quando a assinatura confere', () => {
    const resultado = parseMetaSignedRequest(assinar(valido), [SEGREDO]);
    expect(resultado?.user_id).toBe('17841400000000000');
  });

  it('aceita qualquer um dos segredos candidatos (rotação de chave)', () => {
    const resultado = parseMetaSignedRequest(assinar(valido), [
      'secret-velho',
      SEGREDO,
    ]);
    expect(resultado?.user_id).toBe('17841400000000000');
  });

  it('rejeita assinatura de outro segredo', () => {
    const forjado = assinar(valido, 'segredo-do-atacante');
    expect(parseMetaSignedRequest(forjado, [SEGREDO])).toBeNull();
  });

  // Payload trocado mantendo a assinatura antiga: o alvo do ataque.
  it('rejeita payload adulterado', () => {
    const original = assinar(valido);
    const [assinatura] = original.split('.');
    const outroCorpo = Buffer.from(
      JSON.stringify({ user_id: 'vitima-999' }),
    ).toString('base64url');
    expect(
      parseMetaSignedRequest(`${assinatura}.${outroCorpo}`, [SEGREDO]),
    ).toBeNull();
  });

  // "algorithm": "none" é o downgrade clássico de JWT; aqui não passa.
  it('rejeita algoritmo diferente de HMAC-SHA256', () => {
    const comNone = assinar({ user_id: '1', algorithm: 'none' });
    expect(parseMetaSignedRequest(comNone, [SEGREDO])).toBeNull();
  });

  it('rejeita entrada malformada ou sem segredo', () => {
    expect(parseMetaSignedRequest(undefined, [SEGREDO])).toBeNull();
    expect(parseMetaSignedRequest('sem-ponto', [SEGREDO])).toBeNull();
    expect(parseMetaSignedRequest(assinar(valido), [])).toBeNull();
    expect(parseMetaSignedRequest(assinar(valido), [undefined, ''])).toBeNull();
  });

  it('rejeita quando o payload não é JSON', () => {
    const corpo = Buffer.from('isso não é json').toString('base64url');
    const assinatura = crypto
      .createHmac('sha256', SEGREDO)
      .update(corpo)
      .digest('base64url');
    expect(
      parseMetaSignedRequest(`${assinatura}.${corpo}`, [SEGREDO]),
    ).toBeNull();
  });
});
