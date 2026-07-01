import type { Request, Response } from 'express';
import type { ConfigService } from '@nestjs/config';

/**
 * Refresh token em cookie httpOnly. O access token continua no header
 * (Authorization Bearer, sem mudança no JwtStrategy). Guardar o refresh — que é
 * o token de longa duração — fora do alcance do JS protege contra roubo por XSS.
 *
 * O endpoint de refresh dá PRECEDÊNCIA ao body sobre o cookie: a impersonação
 * do super admin carrega o refresh no body (localStorage) e não deve tocar no
 * cookie do admin. Sessões normais não mandam body → usam o cookie.
 */
export const REFRESH_COOKIE = 'refresh_token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias — casa com JWT_REFRESH_EXPIRATION

function baseOptions(config: ConfigService) {
  const isProd = config.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    // Prod: web e API ficam em domínios diferentes (chat.* e api-chat.*) →
    // None+Secure garante o envio cross-site. Dev (http://localhost): Lax, pois
    // None exigiria Secure (que não vai por http). `path` restringe o cookie
    // aos endpoints de auth.
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/api/v1/auth',
  };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  config: ConfigService,
): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(config), maxAge: MAX_AGE_MS });
}

export function clearRefreshCookie(res: Response, config: ConfigService): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(config));
}

/** Lê o refresh do header Cookie sem depender de cookie-parser. */
export function readRefreshCookie(req: Request): string | undefined {
  const raw = req.headers?.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === REFRESH_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}
