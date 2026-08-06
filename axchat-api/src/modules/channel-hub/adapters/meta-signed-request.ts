import * as crypto from 'crypto';

export interface SignedRequestPayload {
  /** ID do usuário na escala do app (Threads user id, IGSID…). */
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

/**
 * Valida e abre o `signed_request` que a Meta manda nos callbacks de
 * desautorização e de exclusão de dados.
 *
 * Formato: `{assinatura}.{payload}`, os dois em base64url, assinados com
 * HMAC-SHA256 usando o App Secret. Diferente do webhook (que assina o corpo
 * cru num header), aqui a assinatura vem no próprio campo.
 *
 * Aceita vários segredos pelo mesmo motivo do `verifyMetaSignature`: o Threads
 * tem um App Secret separado do app da Meta, e uma rotação de chave não pode
 * derrubar o callback em silêncio.
 *
 * Devolve `null` quando a assinatura não confere — o chamador trata como
 * requisição forjada e ignora.
 */
export function parseMetaSignedRequest(
  signedRequest: string | undefined | null,
  secrets: Array<string | undefined | null>,
): SignedRequestPayload | null {
  if (!signedRequest || !signedRequest.includes('.')) return null;

  const [assinaturaB64, payloadB64] = signedRequest.split('.', 2);
  if (!assinaturaB64 || !payloadB64) return null;

  const candidatos = [
    ...new Set(secrets.filter((s): s is string => !!s && s.trim().length > 0)),
  ];
  if (candidatos.length === 0) return null;

  let recebida: Buffer;
  try {
    recebida = Buffer.from(assinaturaB64, 'base64url');
  } catch {
    return null;
  }

  const confere = candidatos.some((secret) => {
    const esperada = crypto
      .createHmac('sha256', secret)
      .update(payloadB64)
      .digest();
    // timingSafeEqual lança quando os tamanhos diferem (assinatura truncada).
    if (esperada.length !== recebida.length) return false;
    return crypto.timingSafeEqual(esperada, recebida);
  });
  if (!confere) return null;

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as SignedRequestPayload;
    // A Meta só assina com HMAC-SHA256; qualquer outro algoritmo declarado é
    // tentativa de downgrade.
    if (payload.algorithm && !/HMAC-SHA256/i.test(String(payload.algorithm))) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
