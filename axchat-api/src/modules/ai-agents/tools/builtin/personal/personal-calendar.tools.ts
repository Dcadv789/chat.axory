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
    return { output: { ok: true, event } };
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
