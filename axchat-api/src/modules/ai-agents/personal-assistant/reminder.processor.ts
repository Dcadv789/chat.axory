import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service';
import { PERSONAL_REMINDER_QUEUE } from './reminder-scheduler.service';
import { AssistantDeliveryService } from './assistant-delivery.service';
import { DailyBriefingService } from './daily-briefing.service';

/**
 * Tick de 1 min do assistente: (1) dispara os lembretes vencidos (remindAt<=now)
 * e (2) envia o briefing diário de quem está no horário. Entrega via
 * AssistantDeliveryService (in-app + outbound).
 */
@Processor(PERSONAL_REMINDER_QUEUE, { concurrency: 2 })
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: AssistantDeliveryService,
    private readonly briefing: DailyBriefingService,
  ) {
    super();
  }

  async process(_job: Job): Promise<{ reminders: number; briefings: number }> {
    const now = new Date();
    const reminders = await this.fireReminders(now);
    const briefings = await this.briefing.runDue(now).catch((err) => {
      this.logger.error(`briefing scan falhou: ${err?.message ?? err}`);
      return 0;
    });
    return { reminders, briefings };
  }

  private async fireReminders(now: Date): Promise<number> {
    const due = await this.prisma.personalReminder.findMany({
      where: { status: 'PENDING', remindAt: { lte: now } },
      take: 100,
      select: { id: true, organizationId: true, userId: true, message: true },
    });
    if (due.length === 0) return 0;

    let sent = 0;
    for (const r of due) {
      // Marca SENT antes de entregar (evita reenvio no tick seguinte).
      await this.prisma.personalReminder.update({
        where: { id: r.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      try {
        await this.delivery.deliver(
          r.organizationId,
          r.userId,
          `⏰ Lembrete: ${r.message}`,
          { personalReminderId: r.id },
        );
        sent++;
      } catch (err: any) {
        this.logger.error(`Falha ao entregar lembrete ${r.id}: ${err?.message ?? err}`);
      }
    }
    this.logger.log(`personal-reminder tick: ${sent}/${due.length} entregues`);
    return sent;
  }
}
