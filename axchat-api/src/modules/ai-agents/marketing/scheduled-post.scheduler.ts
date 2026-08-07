import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { MarketingScheduleService } from './marketing-schedule.service';

export const SCHEDULED_POST_QUEUE = 'scheduled-posts';
export const SCHEDULED_POST_TICK = 'scheduled-post-tick';

/**
 * Tick de 1 minuto que publica os posts agendados que venceram. Mesmo padrão
 * do lembrete pessoal e do cron de agentes: repeatable do BullMQ com `jobId`
 * fixo, então subir várias instâncias não multiplica o tick.
 *
 * O agendamento em si mora no banco, não como job atrasado — job atrasado some
 * se o Redis for limpo, e não dá pra desenhar um calendário em cima dele.
 */
@Injectable()
export class ScheduledPostSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledPostSchedulerService.name);

  constructor(
    @InjectQueue(SCHEDULED_POST_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        SCHEDULED_POST_TICK,
        {},
        {
          repeat: { pattern: '* * * * *' },
          jobId: 'scheduled-post-tick',
          removeOnComplete: 10,
          removeOnFail: 10,
        },
      );
      this.logger.log('Tick de posts agendados registrado (a cada minuto).');
    } catch (err: any) {
      this.logger.error(
        `Falhou ao registrar o tick de posts agendados: ${err?.message ?? err}`,
      );
    }
  }
}

@Processor(SCHEDULED_POST_QUEUE, { concurrency: 1 })
export class ScheduledPostProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledPostProcessor.name);

  constructor(private readonly schedule: MarketingScheduleService) {
    super();
  }

  // concurrency 1 de propósito: publicar duas vezes não tem desfazer, e o
  // volume é baixo (um punhado de posts por minuto, no pior caso).
  async process(_job: Job): Promise<void> {
    const { publicados, falhas } = await this.schedule.publicarVencidos();
    if (publicados || falhas) {
      this.logger.log(
        `Posts agendados: ${publicados} publicado(s), ${falhas} falha(s).`,
      );
    }
  }
}
