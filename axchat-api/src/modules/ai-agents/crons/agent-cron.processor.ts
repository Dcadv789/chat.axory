import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service';
import { CronTriggerService } from './cron-trigger.service';
import { computeNextRun } from './cron-expression.util';
import {
  AGENT_CRON_RUN_NOW_JOB,
  AGENT_CRON_TICK_JOB,
} from './agent-cron.types';

@Processor('agent-crons', { concurrency: 2 })
export class AgentCronProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentCronProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trigger: CronTriggerService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === AGENT_CRON_RUN_NOW_JOB) {
      const cronId = (job.data as { cronId: string }).cronId;
      await this.trigger.fire(cronId);
      return { fired: cronId };
    }
    if (job.name === AGENT_CRON_TICK_JOB) {
      return this.scanDue();
    }
    return undefined;
  }

  /** Varre os crons vencidos, reagenda o próximo e dispara cada um. */
  private async scanDue(): Promise<{ fired: number }> {
    const now = new Date();
    const due = await this.prisma.agentCron.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        nextRunAt: { not: null, lte: now },
      },
      select: { id: true, cronExpression: true, timezone: true },
    });

    if (due.length === 0) return { fired: 0 };

    let fired = 0;
    for (const cron of due) {
      // Reagenda ANTES de disparar pra evitar dupla execução se o tick
      // seguinte chegar enquanto o agente ainda roda.
      const next = computeNextRun(cron.cronExpression, now, cron.timezone);
      await this.prisma.agentCron.update({
        where: { id: cron.id },
        data: { nextRunAt: next },
      });

      try {
        await this.trigger.fire(cron.id);
        fired++;
      } catch (err: any) {
        this.logger.error(
          `cron tick: falha ao disparar ${cron.id}: ${err?.message ?? err}`,
        );
      }
    }

    this.logger.log(`agent-cron tick: ${fired}/${due.length} disparados`);
    return { fired };
  }
}
