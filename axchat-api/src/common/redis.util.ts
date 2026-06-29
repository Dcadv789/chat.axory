/**
 * Opções de resiliência compartilhadas para clients ioredis avulsos.
 *
 * - `retryStrategy`: reconecta com backoff LIMITADO (cap 5s) em vez de deixar
 *   o comportamento de reconexão sem teto. Nunca retorna null → segue tentando
 *   reconectar pra trás de uma queda do Redis sem desistir pra sempre.
 * - `connectTimeout`: não pendura indefinidamente tentando abrir a conexão.
 *
 * NÃO mexe em `maxRetriesPerRequest`/`enableOfflineQueue` — cada client define
 * a própria semântica de fila/falha por-comando conforme o caso de uso.
 */
export function redisResilienceOptions(): {
  retryStrategy: (times: number) => number;
  connectTimeout: number;
} {
  return {
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
    connectTimeout: 10_000,
  };
}
