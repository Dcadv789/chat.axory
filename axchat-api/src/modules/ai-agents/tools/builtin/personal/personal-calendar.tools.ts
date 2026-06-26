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
export class CreatePersonalEventTool implements AiTool {
  readonly name = 'createPersonalEvent';
  readonly description =
    'Cria um compromisso na agenda do usuário (agenda nativa do AxChat, funciona sem Google).';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'startAt'],
    properties: {
      title: { type: 'string', description: 'Título do compromisso.' },
      startAt: { type: 'string', description: 'Início em ISO 8601 (ex: 2026-06-30T15:00:00-03:00).' },
      endAt: { type: 'string', description: 'Fim em ISO 8601. Opcional.' },
      location: { type: 'string', description: 'Local. Opcional.' },
      description: { type: 'string', description: 'Detalhes. Opcional.' },
      allDay: { type: 'boolean', description: 'Evento de dia inteiro. Opcional.' },
      reminderMinutesBefore: {
        type: 'integer',
        description:
          'Se informado, cria automaticamente um lembrete X minutos antes do evento (ex: 30). Sempre ofereça/use isso ao marcar compromissos.',
        minimum: 0,
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
    const title = String(input.title ?? '').trim();
    const startAt = parseDate(input.startAt);
    if (!title || !startAt) {
      return { output: { ok: false, error: 'title e startAt (ISO) são obrigatórios' } };
    }
    const event = await this.prisma.personalCalendarEvent.create({
      data: {
        organizationId: ctx.organizationId,
        userId,
        title,
        startAt,
        endAt: parseDate(input.endAt),
        location: input.location ? String(input.location) : null,
        description: input.description ? String(input.description) : null,
        allDay: Boolean(input.allDay),
        source: 'NATIVE',
      },
      select: { id: true, title: true, startAt: true, endAt: true },
    });

    // Lembrete automático X min antes (se pedido).
    let reminderId: string | null = null;
    if (input.reminderMinutesBefore != null) {
      const mins = Number(input.reminderMinutesBefore);
      const remindAt = new Date(startAt.getTime() - mins * 60_000);
      const rem = await this.prisma.personalReminder.create({
        data: {
          organizationId: ctx.organizationId,
          userId,
          message: title,
          remindAt,
          eventId: event.id,
        },
        select: { id: true },
      });
      reminderId = rem.id;
    }

    return { output: { ok: true, event, reminderId } };
  }
}

@Injectable()
export class PrepareForEventTool implements AiTool {
  readonly name = 'prepareForEvent';
  readonly description =
    'Prep de reunião/compromisso: junta o contexto de um evento — notas e tarefas relacionadas — pra o usuário chegar preparado.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['eventId'],
    properties: {
      eventId: { type: 'string', description: 'ID do evento (de listPersonalEvents).' },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalContextService,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const userId = await this.personal.resolveUserId(ctx);
    if (!userId) return NO_OWNER;
    const scope = { organizationId: ctx.organizationId, userId };
    const event = await this.prisma.personalCalendarEvent.findFirst({
      where: { id: String(input.eventId ?? ''), ...scope },
    });
    if (!event) return { output: { ok: false, error: 'evento não encontrado' } };

    // Palavras significativas do título pra casar notas/tarefas relacionadas.
    const words = event.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4);

    const [notes, tasks] = await Promise.all([
      this.prisma.personalNote.findMany({
        where: {
          ...scope,
          OR: words.length
            ? words.map((w) => ({ content: { contains: w, mode: 'insensitive' as const } }))
            : undefined,
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, content: true, createdAt: true },
      }),
      this.prisma.personalTask.findMany({
        where: {
          ...scope,
          status: { in: ['TODO', 'DOING'] },
          OR: words.length
            ? words.map((w) => ({ title: { contains: w, mode: 'insensitive' as const } }))
            : undefined,
        },
        take: 8,
        select: { id: true, title: true, status: true },
      }),
    ]);

    return {
      output: {
        ok: true,
        event: {
          title: event.title,
          startAt: event.startAt,
          location: event.location,
          description: event.description,
        },
        relatedNotes: notes,
        relatedTasks: tasks,
      },
    };
  }
}

@Injectable()
export class ListPersonalEventsTool implements AiTool {
  readonly name = 'listPersonalEvents';
  readonly description =
    'Lista os compromissos da agenda do usuário num intervalo (nativos + Google, se conectado).';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      from: { type: 'string', description: 'Início do intervalo (ISO). Padrão: agora.' },
      to: { type: 'string', description: 'Fim do intervalo (ISO). Padrão: +7 dias.' },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalContextService,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const userId = await this.personal.resolveUserId(ctx);
    if (!userId) return NO_OWNER;
    const from = parseDate(input.from) ?? new Date();
    const to =
      parseDate(input.to) ?? new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events = await this.prisma.personalCalendarEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId,
        startAt: { gte: from, lte: to },
      },
      orderBy: { startAt: 'asc' },
      take: 100,
      select: { id: true, title: true, startAt: true, endAt: true, location: true, source: true },
    });
    return { output: { ok: true, count: events.length, events } };
  }
}
