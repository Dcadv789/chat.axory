import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';

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

/**
 * Silencia o `error` do client — no sentido de NÃO deixar ele derrubar a API.
 *
 * Em Node, um `EventEmitter` que emite `error` sem nenhum listener joga a
 * exceção pra cima e mata o processo. O ioredis emite `error` a cada falha de
 * conexão, então um Redis fora do ar derrubava a API inteira em vez de
 * degradar: foi assim que ela morreu duas vezes, com
 * `MaxRetriesPerRequestError`, quando o túnel de desenvolvimento caiu.
 *
 * Registrar o listener é o que transforma "processo morto" em "log de erro".
 * Chame SEMPRE logo depois de `new Redis(...)`.
 *
 * O log é limitado a uma linha por minuto por client: durante uma queda o
 * ioredis emite erro a cada tentativa de reconexão, e sem isso o arquivo de
 * log vira uma parede de mensagens idênticas.
 */
export function naoDerrubarAApi(redis: Redis, nome: string): Redis {
  const logger = new Logger(`Redis:${nome}`);
  let ultimoLog = 0;

  redis.on('error', (err: Error) => {
    const agora = Date.now();
    if (agora - ultimoLog < 60_000) return;
    ultimoLog = agora;
    logger.error(
      `Redis indisponível (${nome}): ${err.message}. A API segue de pé; o que depende de Redis fica degradado até voltar.`,
    );
  });

  return redis;
}
