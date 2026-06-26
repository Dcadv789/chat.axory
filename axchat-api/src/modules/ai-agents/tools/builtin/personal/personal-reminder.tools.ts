import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../../tool.types';
import { PersonalContextService } from './personal-context.service';

const NO_OWNER = { output: { ok: false, error: 'assistente_nao_configurado' } };

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class CreatePersonalReminderTool implements AiTool {
  readonly name = 'createPersonalReminder';
  readonly description =
    'Cria um lembrete pontual: no horário definido, o assistente notifica o usuário. Use o horário absoluto (remindAt) OU, para "X min antes de um compromisso", passe eventId + minutesBefore.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['message'],
    properties: {
      message: { type: 'string', description: 'O que lembrar (texto da notificação).' },
      remindAt: {
        type: 'string',
        description:
          'Horário absoluto do lembrete em ISO 8601 (ex: 2026-06-30T08:30:00-03:00). Use a "Hora atual" do contexto para calcular.',
      },
      eventId: {
        type: 'string',
        description: 'ID de um evento da agenda (de listPersonalEvents). Use com minutesBefore.',
      },
      minutesBefore: {
        type: 'integer',
        description: 'Minutos antes do início do evento (ex: 30). Requer eventId.',
        minimum: 0,
      },
      taskId: {
        type: 'string',
        description: 'ID de uma tarefa a vincular ao lembrete (opcional).',
      },
      recurrence: {
        type: 'string',
        enum: ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
        description:
          'Recorrência: DAILY (todo dia), WEEKLY, MONTHLY, YEARLY (aniversários/datas anuais). Omita ou NONE = uma vez só.',
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalContextService,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const userId = await this.personal.resolveUserId(ctx);
    if (!userId) return NO_OWNER;
    const message = String(input.message ?? '').trim();
    if (!message) return { output: { ok: false, error: 'message é obrigatório' } };

    let remindAt = parseDate(input.remindAt);
    let eventId: string | null = null;

    // Modo relativo a um evento ("30 min antes"): calcula a partir do startAt.
    if (input.eventId) {
      const ev = await this.prisma.personalCalendarEvent.findFirst({
        where: { id: String(input.eventId), organizationId: ctx.organizationId, userId },
        select: { id: true, startAt: true },
      });
      if (!ev) return { output: { ok: false, error: 'evento não encontrado' } };
      eventId = ev.id;
      const mins = input.minutesBefore != null ? Number(input.minutesBefore) : 0;
      remindAt = new Date(ev.startAt.getTime() - mins * 60_000);
    }

    if (!remindAt) {
      return {
        output: {
          ok: false,
          error: 'informe remindAt (ISO) ou eventId + minutesBefore',
        },
      };
    }

    const RECUR = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
    const recurrence = RECUR.includes(String(input.recurrence))
      ? (String(input.recurrence) as any)
      : 'NONE';

    const reminder = await this.prisma.personalReminder.create({
      data: {
        organizationId: ctx.organizationId,
        userId,
        message,
        remindAt,
        eventId,
        taskId: input.taskId ? String(input.taskId) : null,
        recurrence,
      },
      select: { id: true, remindAt: true, message: true, recurrence: true },
    });
    return { output: { ok: true, reminder } };
  }
}

@Injectable()
export class ListPersonalRemindersTool implements AiTool {
  readonly name = 'listPersonalReminders';
  readonly description = 'Lista os lembretes pendentes do usuário.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {},
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalContextService,
  ) {}

  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const userId = await this.personal.resolveUserId(ctx);
    if (!userId) return NO_OWNER;
    const reminders = await this.prisma.personalReminder.findMany({
      where: { organizationId: ctx.organizationId, userId, status: 'PENDING' },
      orderBy: { remindAt: 'asc' },
      take: 50,
      select: { id: true, message: true, remindAt: true },
    });
    return { output: { ok: true, count: reminders.length, reminders } };
  }
}

@Injectable()
export class SnoozePersonalReminderTool implements AiTool {
  readonly name = 'snoozePersonalReminder';
  readonly description =
    'Adia um lembrete: re-agenda pra daqui X minutos OU pra um novo horário. Use quando o usuário disser "me lembra de novo daqui 1h" ou "adia pra amanhã".';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['reminderId'],
    properties: {
      reminderId: { type: 'string', description: 'ID do lembrete (de listPersonalReminders).' },
      minutes: { type: 'integer', description: 'Adiar por N minutos a partir de agora.', minimum: 1 },
      remindAt: { type: 'string', description: 'Novo horário absoluto (ISO 8601), alternativa a minutes.' },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalContextService,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const userId = await this.personal.resolveUserId(ctx);
    if (!userId) return NO_OWNER;
    let when = parseDate(input.remindAt);
    if (!when && input.minutes != null) {
      when = new Date(Date.now() + Number(input.minutes) * 60_000);
    }
    if (!when) return { output: { ok: false, error: 'informe minutes ou remindAt' } };

    const r = await this.prisma.personalReminder.updateMany({
      where: { id: String(input.reminderId ?? ''), organizationId: ctx.organizationId, userId },
      data: { remindAt: when, status: 'PENDING', sentAt: null },
    });
    return { output: { ok: r.count > 0, remindAt: when } };
  }
}

@Injectable()
export class CancelPersonalReminderTool implements AiTool {
  readonly name = 'cancelPersonalReminder';
  readonly description = 'Cancela um lembrete pendente.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['reminderId'],
    properties: {
      reminderId: { type: 'string', description: 'ID do lembrete (de listPersonalReminders).' },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalContextService,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const userId = await this.personal.resolveUserId(ctx);
    if (!userId) return NO_OWNER;
    const r = await this.prisma.personalReminder.updateMany({
      where: {
        id: String(input.reminderId ?? ''),
        organizationId: ctx.organizationId,
        userId,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });
    return { output: { ok: r.count > 0, cancelled: r.count } };
  }
}
