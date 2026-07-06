import * as crypto from 'node:crypto';

/**
 * State assinado do OAuth do Threads. O callback do Threads chega SEM sessão
 * (é um redirect do navegador vindo da Meta), então carregamos org + criador
 * dentro do próprio `state`, assinado com HMAC(JWT_SECRET) e com validade curta.
 * Assim o callback sabe pra qual org criar o canal sem confiar em nada do cliente.
 */
export interface ThreadsOAuthState {
  o: string; // organizationId
  u: string; // userOrganizationId (criador)
  r: string; // role do criador
  n: string; // nome do canal
  v?: 'ORG' | 'PRIVATE'; // visibilidade
  exp: number; // epoch ms de expiração
}

const secret = (): string => process.env.JWT_SECRET || 'dev-secret';

export function signThreadsState(payload: ThreadsOAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyThreadsState(token: string): ThreadsOAuthState | null {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac('sha256', secret())
    .update(body)
    .digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as ThreadsOAuthState;
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
