import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  AGENT_CRON_TICK_JOB,
  AGENT_CRON_TICK_PATTERN,
} from './agent-cron.types';

/**
 * Registra um repeatable job ("tick") de 1 minuto na fila 'agent-crons'.
 * O processor consome o tick e varre os AgentCron vencidos. Usa BullMQ
 * repeatable (não @nestjs/schedule) pra manter consistência com o resto do
 * projeto (pending-action-cron, watchdog-cron). Idempotente por jobId.
 */
@Injectable()
export class AgentCronSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AgentCronSchedulerService.name);

  constructor(
    @InjectQueue('agent-crons') private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        AGENT_CRON_TICK_JOB,
        {},
        {
          repeat: { pattern: AGENT_CRON_TICK_PATTERN },
          jobId: 'agent-cron-tick',
          removeOnComplete: 10,
          removeOnFail: 10,
        },
      );
      this.logger.log({
        msg: 'agent_cron_scheduler_registered',
        pattern: AGENT_CRON_TICK_PATTERN,
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to register agent-cron scheduler: ${err?.message ?? err}`,
      );
    }
  }
}
