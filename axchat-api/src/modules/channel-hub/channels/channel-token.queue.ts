import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ChannelTokenRefreshService } from './channel-token-refresh.service';

export const CHANNEL_TOKEN_QUEUE = 'channel-tokens';
export const REFRESH_TOKENS_JOB = 'refresh-expiring-tokens';

/** Uma vez por dia, 4h da manhã — a folga de 10 dias torna a hora irrelevante. */
const PADRAO_REPETICAO = '0 4 * * *';
const ID_JOB_REPETIDO = 'channel-token-refresh-cron';

/**
 * Agenda a renovação diária dos tokens de longa duração.
 *
 * Mesmo esquema de repeatable do BullMQ usado no resto do projeto
 * (pending-action, agent-crons, watchdog): idempotente por `jobId`, então
 * várias instâncias da API registram a mesma chave e o Bull mantém uma só.
 */
@Injectable()
export class ChannelTokenCronService implements OnModuleInit {
  private readonly logger = new Logger(ChannelTokenCronService.name);

  constructor(
    @InjectQueue(CHANNEL_TOKEN_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        REFRESH_TOKENS_JOB,
        {},
        {
          repeat: { pattern: PADRAO_REPETICAO },
          jobId: ID_JOB_REPETIDO,
          removeOnComplete: 10,
          removeOnFail: 10,
        },
      );
      this.logger.log({
        msg: 'channel_token_refresh_cron_registered',
        pattern: PADRAO_REPETICAO,
      });
    } catch (err: any) {
      this.logger.error(
        `Falha ao registrar o cron de renovação de token: ${err?.message ?? err}`,
      );
    }
  }
}

@Processor(CHANNEL_TOKEN_QUEUE)
export class ChannelTokenProcessor extends WorkerHost {
  private readonly logger = new Logger(ChannelTokenProcessor.name);

  constructor(private readonly refresher: ChannelTokenRefreshService) {
    super();
  }

  async process(): Promise<{ renovados: number; falhas: number }> {
    const resultado = await this.refresher.refreshExpiringTokens();
    if (resultado.renovados > 0 || resultado.falhas > 0) {
      this.logger.log(
        `Renovação de tokens: ${resultado.renovados} renovado(s), ${resultado.falhas} falha(s).`,
      );
    }
    return resultado;
  }
}
