import { ConsoleLogger } from '@nestjs/common';
import { getRequestId } from '../context/request-context';

/**
 * Logger que prefixa cada mensagem (quando é string) com o correlation-id da
 * request atual, lido do AsyncLocalStorage. Assim qualquer `this.logger.log(...)`
 * em qualquer service sai com `[<requestId>]` e dá pra amarrar todas as linhas
 * de uma mesma request. Fora de uma request o store está vazio e a mensagem sai
 * sem prefixo (mantém o formato padrão do Nest: contexto, timestamp, cores).
 */
export class AppLogger extends ConsoleLogger {
  private withId(message: any): any {
    if (typeof message !== 'string') return message;
    const id = getRequestId();
    return id ? `[${id}] ${message}` : message;
  }

  log(message: any, ...optionalParams: any[]): void {
    super.log(this.withId(message), ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]): void {
    super.error(this.withId(message), ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]): void {
    super.warn(this.withId(message), ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]): void {
    super.debug(this.withId(message), ...optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]): void {
    super.verbose(this.withId(message), ...optionalParams);
  }
}
