import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Rate limiter in-memory (sliding window) para rotas de autenticação públicas
 * (login/register). Sem isso, `/auth/login` aceita tentativas ilimitadas →
 * brute force de senha. Keyed por `${ip}:${email}` pra não punir usuários
 * distintos atrás do mesmo NAT. 429 quando estoura.
 *
 * Limitação consciente: estado por-instância (reseta no restart, não coordena
 * entre réplicas). Para multi-instância, migrar o contador pro Redis.
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  private readonly logger = new Logger(LoginThrottleGuard.name);

  private static readonly WINDOW_MS = 60_000; // 1 min
  private static readonly MAX_HITS = 10; // 10 tentativas/min por IP+email

  private readonly hits = new Map<string, number[]>();
  private lastGc = 0;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(req);
    const email = String((req.body as Record<string, unknown>)?.email ?? '')
      .toLowerCase()
      .trim();
    const key = `${ip}:${email}`;

    const now = Date.now();
    const windowStart = now - LoginThrottleGuard.WINDOW_MS;
    const recent = (this.hits.get(key) ?? []).filter((t) => t >= windowStart);
    recent.push(now);
    this.hits.set(key, recent);

    if (now - this.lastGc > 60_000) {
      this.lastGc = now;
      for (const [k, arr] of this.hits.entries()) {
        const trimmed = arr.filter((t) => t >= windowStart);
        if (trimmed.length === 0) this.hits.delete(k);
        else this.hits.set(k, trimmed);
      }
    }

    if (recent.length > LoginThrottleGuard.MAX_HITS) {
      this.logger.warn(`Login throttled for ${key} (${recent.length}/min)`);
      throw new HttpException(
        'Muitas tentativas. Tente novamente em alguns instantes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private extractIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
    if (Array.isArray(fwd) && fwd.length > 0) return fwd[0].split(',')[0].trim();
    return req.ip || 'unknown';
  }
}
