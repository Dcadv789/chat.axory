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

    const reminder = await this.prisma.personalReminder.create({
      data: {
        organizationId: ctx.organizationId,
        userId,
        message,
        remindAt,
        eventId,
        taskId: input.taskId ? String(input.taskId) : null,
      },
      select: { id: true, remindAt: true, message: true },
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
