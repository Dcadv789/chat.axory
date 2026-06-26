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

  async runDue(now: Date): Promise<number> {
    const configs = await this.prisma.personalAssistantConfig.findMany({
      where: { dailyBriefingHour: { not: null }, channelId: { not: null } },
      select: {
        organizationId: true,
        userId: true,
        timezone: true,
        dailyBriefingHour: true,
        lastBriefingSentAt: true,
      },
    });

    let sent = 0;
    for (const cfg of configs) {
      const tz = cfg.timezone || 'America/Sao_Paulo';
      const { hour, ymd } = localParts(now, tz);
      if (hour !== cfg.dailyBriefingHour) continue;
      // Já enviou hoje (mesma data local)?
      if (cfg.lastBriefingSentAt) {
        const last = localParts(cfg.lastBriefingSentAt, tz);
        if (last.ymd === ymd) continue;
      }

      try {
        const text = await this.compose(cfg.organizationId, cfg.userId, tz, now);
        const ok = await this.delivery.deliver(cfg.organizationId, cfg.userId, text, {
          dailyBriefing: true,
        });
        if (ok) {
          await this.prisma.personalAssistantConfig.update({
            where: {
              uq_assistant_org_user: {
                organizationId: cfg.organizationId,
                userId: cfg.userId,
              },
            },
            data: { lastBriefingSentAt: now },
          });
          sent++;
        }
      } catch (err: any) {
        this.logger.error(
          `briefing falhou (org=${cfg.organizationId} user=${cfg.userId}): ${err?.message ?? err}`,
        );
      }
    }
    if (sent > 0) this.logger.log(`daily briefing: ${sent} enviado(s)`);
    return sent;
  }

  private async compose(
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
}
