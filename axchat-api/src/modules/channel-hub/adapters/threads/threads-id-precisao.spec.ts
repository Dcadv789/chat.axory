import { extrairIdNumericoCru } from './threads.http-client';

/**
 * Dois bugs reais moram aqui, e os dois falhavam em SILÊNCIO.
 *
 * 1. O `user_id` do Threads tem 17 dígitos e estoura o inteiro seguro do
 *    JavaScript. Parseado como número, perde os últimos dígitos — o canal
 *    conectava com um id plausível que não existia, e tudo depois respondia
 *    "Object with ID ... does not exist".
 *
 * 2. A regex que evita o item 1 foi escrita em template literal comum, onde
 *    `\s` colapsa para `s`. Ela parou de casar, o id virou `undefined` e a
 *    reconexão morria em "Threads não retornou access_token/user_id" — sem
 *    nada no código parecendo errado.
 */
describe('extrairIdNumericoCru', () => {
  // Resposta real do POST /oauth/access_token: user_id vem como NÚMERO cru.
  const respostaReal =
    '{"access_token":"THAAxxxxxxxx","user_id":37554767000838073}';

  it('preserva os 17 dígitos que o JSON.parse arredondaria', () => {
    expect(extrairIdNumericoCru(respostaReal, 'user_id')).toBe(
      '37554767000838073',
    );
  });

  it('prova que o caminho antigo (JSON.parse) corrompia o id', () => {
    const parseado = String(JSON.parse(respostaReal).user_id);
    expect(parseado).not.toBe('37554767000838073');
    expect(Number('37554767000838073')).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
  });

  it('aceita o id como string também', () => {
    expect(
      extrairIdNumericoCru('{"user_id":"37554767000838073"}', 'user_id'),
    ).toBe('37554767000838073');
  });

  it('tolera espaço entre a chave e o valor', () => {
    expect(extrairIdNumericoCru('{"user_id"  :  12345 }', 'user_id')).toBe(
      '12345',
    );
  });

  it('devolve undefined quando o campo não veio', () => {
    expect(extrairIdNumericoCru('{"access_token":"x"}', 'user_id')).toBeUndefined();
    expect(extrairIdNumericoCru('', 'user_id')).toBeUndefined();
  });
});
