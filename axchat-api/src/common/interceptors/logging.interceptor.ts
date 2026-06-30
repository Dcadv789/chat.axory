import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method } = request;

    // Loga só o PATH (sem querystring) — params como ?search= e ?confirm=
    // carregam PII (telefone/nome) que não deve ir pro log.
    const rawUrl: string = request.originalUrl || request.url || '';
    const path = rawUrl.split('?')[0];

    // O requestId já foi definido pelo middleware de contexto no bootstrap
    // (e está no AsyncLocalStorage). Reaproveita; só gera como rede de
    // segurança caso este interceptor rode fora daquele fluxo.
    const requestId =
      request.requestId ||
      (typeof request.headers?.['x-request-id'] === 'string' &&
        request.headers['x-request-id']) ||
      randomUUID();
    request.requestId = requestId;
    response.setHeader?.('x-request-id', requestId);

    // Sem prefixo manual de id: o AppLogger carimba `[requestId]` em toda
    // linha a partir do contexto (evita duplicar o id na linha de acesso).
    const now = Date.now();
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${method} ${path} ${response.statusCode} ${Date.now() - now}ms`,
        );
      }),
    );
  }
}
