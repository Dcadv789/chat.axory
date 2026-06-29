import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Request } from 'express';
import { redisResilienceOptions } from '../../common/redis.util';

/**
 * Rate limiter para rotas de auth públicas (login/register). Sem isso,
 * `/auth/login` aceita tentativas ilimitadas → brute force de senha.
 *
 * Janela fixa no Redis (`INCR` + `EXPIRE`), keyed por `${ip}:${email}` — assim
 * o limite é COMPARTILHADO entre réplicas (não reseta por-instância).
 *
 * Fail-open: se o Redis estiver indisponível, LIBERA a request (não trava
 * login por causa de infra). O custo é não-throttle temporário, não um outage.
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(LoginThrottleGuard.name);
  private readonly redis: Redis;

  private static readonly WINDOW_SEC = 60; // 1 min
  private static readonly MAX_HITS = 10; // 10 tentativas/min por IP+email

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      // Falha rápido em vez de enfileirar — combina com o fail-open abaixo.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      ...redisResilienceOptions(),
    });
    this.redis.on('error', (err) =>
      this.logger.warn(`Redis (login-throttle) erro: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      /* noop */
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(req);
    const email = String((req.body as Record<string, unknown>)?.email ?? '')
      .toLowerCase()
      .trim();
    const key = `login-throttle:${ip}:${email}`;

    let count: number;
    try {
      count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, LoginThrottleGuard.WINDOW_SEC);
      }
    } catch (err: any) {
      // Redis fora → fail-open (não bloqueia login por infra).
      this.logger.warn(
        `login-throttle indisponível (fail-open): ${err?.message ?? err}`,
      );
      return true;
    }

    if (count > LoginThrottleGuard.MAX_HITS) {
      this.logger.warn(`Login throttled for ${key} (${count}/min)`);
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
