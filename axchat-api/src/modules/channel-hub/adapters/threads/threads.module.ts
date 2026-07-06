import { Module } from '@nestjs/common';
import { ThreadsHttpClient } from './threads.http-client';

/**
 * Threads é canal de PUBLICAÇÃO (sem inbound de conversa), então o módulo só
 * expõe o HTTP client — não registra adapters de mensagem no registry.
 */
@Module({
  providers: [ThreadsHttpClient],
  exports: [ThreadsHttpClient],
})
export class ThreadsModule {}
