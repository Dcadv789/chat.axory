import * as crypto from 'crypto';

/**
 * Verificação do `x-hub-signature-256` dos webhooks da Meta (WhatsApp, Instagram).
 *
 * Aceita VÁRIOS segredos candidatos de propósito. O canal guarda uma cópia do
 * App Secret no momento em que foi conectado; quando o Super Admin troca a
 * chave em Integrações (rotação, ou migração pra outro app Meta), essa cópia
 * fica velha e TODO webhook passa a ser rejeitado — em silêncio, pra sempre.
 * Foi exatamente o que derrubou o recebimento de DMs do Instagram.
 *
 * Passando também os segredos atuais da plataforma, trocar a chave volta a
 * consertar os canais existentes sozinho. Todos os candidatos são apps nossos,
 * então testar mais de um não abre brecha: continua sendo HMAC, e quem não tem
 * nenhum dos segredos não forja assinatura nenhuma.
 */
export function verifyMetaSignature(
  headers: Record<string, string>,
  rawBody: Buffer,
  secrets: Array<string | undefined | null>,
): boolean {
  const signature = headers['x-hub-signature-256'];
  if (!signature) return false;

  const candidates = [
    ...new Set(secrets.filter((s): s is string => !!s && s.trim().length > 0)),
  ];
  if (candidates.length === 0) return false;

  const received = Buffer.from(signature);
  // `some` sem short-circuit precoce não importa aqui: o número de segredos é
  // fixo e pequeno, e cada comparação é constante no tempo.
  return candidates.some((secret) => {
    const expected = Buffer.from(
      'sha256=' +
        crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
    );
    // timingSafeEqual lança quando os tamanhos diferem (assinatura truncada).
    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(received, expected);
  });
}
