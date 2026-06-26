import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../../tool.types';
import { PersonalContextService } from './personal-context.service';

const NO_OWNER = {
  output: { ok: false, error: 'assistente_nao_configurado' },
};

@Injectable()
export class CreatePersonalNoteTool implements AiTool {
  readonly name = 'createPersonalNote';
  readonly description =
    'Salva uma nota/anotação rápida do usuário (ideias, brainstorm, lembrança).';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['content'],
    properties: {
      content: { type: 'string', description: 'Texto da nota.' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Etiquetas opcionais (ex: ["ideia","financeiro"]).',
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
    const content = String(input.content ?? '').trim();
    if (!content) return { output: { ok: false, error: 'content é obrigatório' } };
    const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];
    const note = await this.prisma.personalNote.create({
      data: { organizationId: ctx.organizationId, userId, content, tags },
      select: { id: true, createdAt: true },
    });
    return { output: { ok: true, note } };
  }
}

@Injectable()
export class ListPersonalNotesTool implements AiTool {
  readonly name = 'listPersonalNotes';
  readonly description =
    'Lista as notas do usuário, opcionalmente filtrando por texto ou etiqueta.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', description: 'Texto a buscar no conteúdo (opcional).' },
      tag: { type: 'string', description: 'Filtra por etiqueta (opcional).' },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalContextService,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const userId = await this.personal.resolveUserId(ctx);
    if (!userId) return NO_OWNER;
    const where: any = { organizationId: ctx.organizationId, userId };
    if (input.query) where.content = { contains: String(input.query), mode: 'insensitive' };
    if (input.tag) where.tags = { has: String(input.tag) };
    const notes = await this.prisma.personalNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, content: true, tags: true, createdAt: true },
    });
    return { output: { ok: true, count: notes.length, notes } };
  }
}
