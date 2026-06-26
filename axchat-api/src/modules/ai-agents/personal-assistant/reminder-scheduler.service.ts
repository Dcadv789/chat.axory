import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const PERSONAL_REMINDER_QUEUE = 'personal-reminders';
export const PERSONAL_REMINDER_TICK = 'personal-reminder-tick';

/**
 * Tick de 1 minuto que varre os lembretes pessoais vencidos. Mesmo padrão do
 * AgentCron (BullMQ repeatable, idempotente por jobId).
 */
@Injectable()
export class ReminderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectQueue(PERSONAL_REMINDER_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        PERSONAL_REMINDER_TICK,
        {},
        {
          repeat: { pattern: '* * * * *' },
          jobId: 'personal-reminder-tick',
          removeOnComplete: 10,
          removeOnFail: 10,
        },
      );
      this.logger.log({ msg: 'personal_reminder_scheduler_registered' });
    } catch (err: any) {
      this.logger.error(
        `Failed to register personal reminder scheduler: ${err?.message ?? err}`,
      );
    }
  }
}
