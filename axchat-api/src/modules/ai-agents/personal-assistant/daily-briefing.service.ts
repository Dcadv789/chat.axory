import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AssistantDeliveryService } from './assistant-delivery.service';

/** Parte um instante nos campos locais (hora + data YYYY-MM-DD) de um timezone. */
function localParts(date: Date, timeZone: string): { hour: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  return { hour, ymd: `${get('year')}-${get('month')}-${get('day')}` };
}

function fmtTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Briefing diário ("bom dia, hoje você tem..."). Varrido a cada minuto (junto
 * do tick de lembretes): pra cada assistente com dailyBriefingHour, se a hora
 * LOCAL do usuário == a hora configurada e ainda não enviou hoje, compõe e
 * entrega o resumo do dia (compromissos, tarefas do dia/atrasadas, lembretes).
 */
@Injectable()
export class DailyBriefingService {
  private readonly logger = new Logger(DailyBriefingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: AssistantDeliveryService,
  ) {}

  /** Roda os dois resumos: matinal (briefing) e noturno (review). */
  async runDue(now: Date): Promise<number> {
    const morning = await this.scan(now, 'morning');
    const evening = await this.scan(now, 'evening');
    return morning + evening;
  }

  private async scan(now: Date, kind: 'morning' | 'evening'): Promise<number> {
    const hourField = kind === 'morning' ? 'dailyBriefingHour' : 'eveningSummaryHour';
    const lastField = kind === 'morning' ? 'lastBriefingSentAt' : 'lastEveningSentAt';

    const configs = await this.prisma.personalAssistantConfig.findMany({
      where: { [hourField]: { not: null }, channelId: { not: null } } as any,
      select: {
        organizationId: true,
        userId: true,
        timezone: true,
        dailyBriefingHour: true,
        eveningSummaryHour: true,
        lastBriefingSentAt: true,
        lastEveningSentAt: true,
      },
    });

    let sent = 0;
    for (const cfg of configs) {
      const tz = cfg.timezone || 'America/Sao_Paulo';
      const targetHour = (cfg as any)[hourField] as number;
      const lastSent = (cfg as any)[lastField] as Date | null;
      const { hour, ymd } = localParts(now, tz);
      if (hour !== targetHour) continue;
      if (lastSent && localParts(lastSent, tz).ymd === ymd) continue;

      try {
        const text =
          kind === 'morning'
            ? await this.composeMorning(cfg.organizationId, cfg.userId, tz, now)
            : await this.composeEvening(cfg.organizationId, cfg.userId, tz, now);
        const ok = await this.delivery.deliver(cfg.organizationId, cfg.userId, text, {
          [kind === 'morning' ? 'dailyBriefing' : 'eveningSummary']: true,
        });
        if (ok) {
          await this.prisma.personalAssistantConfig.update({
            where: {
              uq_assistant_org_user: {
                organizationId: cfg.organizationId,
                userId: cfg.userId,
              },
            },
            data: { [lastField]: now } as any,
          });
          sent++;
        }
      } catch (err: any) {
        this.logger.error(
          `${kind} resumo falhou (org=${cfg.organizationId} user=${cfg.userId}): ${err?.message ?? err}`,
        );
      }
    }
    if (sent > 0) this.logger.log(`${kind} resumo: ${sent} enviado(s)`);
    return sent;
  }

  private async composeMorning(
    organizationId: string,
    userId: string,
    tz: string,
    now: Date,
  ): Promise<string> {
    // Janela "hoje" no fuso do usuário (do agora até o fim do dia local).
    const { ymd } = localParts(now, tz);
    const endOfDay = new Date(`${ymd}T23:59:59`);
    const scope = { organizationId, userId };

    const [events, tasks, reminders] = await Promise.all([
      this.prisma.personalCalendarEvent.findMany({
        where: { ...scope, startAt: { gte: now, lte: endOfDay } },
        orderBy: { startAt: 'asc' },
        take: 20,
      }),
      this.prisma.personalTask.findMany({
        where: {
          ...scope,
          status: { in: ['TODO', 'DOING'] },
          OR: [{ dueAt: { lte: endOfDay } }, { dueAt: null }],
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        take: 10,
      }),
      this.prisma.personalReminder.findMany({
        where: { ...scope, status: 'PENDING', remindAt: { gte: now, lte: endOfDay } },
        orderBy: { remindAt: 'asc' },
        take: 10,
      }),
    ]);

    const lines: string[] = ['☀️ Bom dia! Seu resumo de hoje:'];

    if (events.length) {
      lines.push('', '📅 Compromissos:');
      for (const e of events) {
        lines.push(`• ${fmtTime(e.startAt, tz)} — ${e.title}${e.location ? ` (${e.location})` : ''}`);
      }
    }

    const overdue = tasks.filter((t) => t.dueAt && t.dueAt < now);
    const dueToday = tasks.filter((t) => !overdue.includes(t));
    if (overdue.length) {
      lines.push('', '⚠️ Tarefas atrasadas:');
      for (const t of overdue) lines.push(`• ${t.title}`);
    }
    if (dueToday.length) {
      lines.push('', '✅ Tarefas pra hoje:');
      for (const t of dueToday.slice(0, 8)) lines.push(`• ${t.title}`);
    }

    if (reminders.length) {
      lines.push('', '⏰ Lembretes de hoje:');
      for (const r of reminders) lines.push(`• ${fmtTime(r.remindAt, tz)} — ${r.message}`);
    }

    if (events.length === 0 && tasks.length === 0 && reminders.length === 0) {
      lines.push('', 'Agenda livre e nada pendente. Bom dia pra organizar o que importa. 🙌');
    }

    return lines.join('\n');
  }

  /** Resumo de fim de dia: o que ficou pendente + agenda de amanhã. */
  private async composeEvening(
    organizationId: string,
    userId: string,
    tz: string,
    now: Date,
  ): Promise<string> {
    const scope = { organizationId, userId };
    const { ymd } = localParts(now, tz);
    const endOfToday = new Date(`${ymd}T23:59:59`);
    const tomorrowStart = new Date(endOfToday.getTime() + 1000);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 3600_000);

    const [pending, doneToday, tomorrow] = await Promise.all([
      this.prisma.personalTask.findMany({
        where: { ...scope, status: { in: ['TODO', 'DOING'] } },
        orderBy: [{ dueAt: 'asc' }],
        take: 10,
      }),
      this.prisma.personalTask.count({
        where: { ...scope, status: 'DONE', completedAt: { gte: new Date(`${ymd}T00:00:00`) } },
      }),
      this.prisma.personalCalendarEvent.findMany({
        where: { ...scope, startAt: { gte: tomorrowStart, lte: tomorrowEnd } },
        orderBy: { startAt: 'asc' },
        take: 10,
      }),
    ]);

    const lines: string[] = ['🌙 Resumo do dia:'];
    lines.push('', `✅ Concluídas hoje: ${doneToday}`);

    if (pending.length) {
      lines.push('', '📌 Ainda pendente:');
      for (const t of pending.slice(0, 8)) lines.push(`• ${t.title}`);
    } else {
      lines.push('', 'Nada pendente — dia fechado. 👏');
    }

    if (tomorrow.length) {
      lines.push('', '📅 Amanhã:');
      for (const e of tomorrow) lines.push(`• ${fmtTime(e.startAt, tz)} — ${e.title}`);
    }

    return lines.join('\n');
  }
}
