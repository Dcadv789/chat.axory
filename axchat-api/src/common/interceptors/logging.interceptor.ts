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

    // Correlation id: reaproveita o x-request-id do proxy se vier, senão gera.
    // Vai no log de acesso e volta no header de resposta — um cliente que
    // reporta um erro pode passar o id pra rastrear a request.
    const requestId =
      (typeof request.headers?.['x-request-id'] === 'string' &&
        request.headers['x-request-id']) ||
      randomUUID();
    request.requestId = requestId;
    response.setHeader?.('x-request-id', requestId);

    const now = Date.now();
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `[${requestId}] ${method} ${path} ${response.statusCode} ${Date.now() - now}ms`,
        );
      }),
    );
  }
}
