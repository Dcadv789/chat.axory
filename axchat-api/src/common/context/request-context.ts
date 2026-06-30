import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  /** Correlation-id da request (x-request-id do proxy ou um UUID gerado). */
  requestId: string;
}

/**
 * Contexto por-request propagado via AsyncLocalStorage. É preenchido por um
 * middleware no bootstrap e lido pelo AppLogger pra carimbar TODAS as linhas de
 * log com o mesmo correlation-id — sem precisar passar o id manualmente entre
 * controllers, services e chamadas assíncronas. Fora de uma request (bootstrap,
 * crons, workers de fila) o store fica vazio.
 */
export const requestContext = new AsyncLocalStorage<RequestStore>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
