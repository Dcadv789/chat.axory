import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../../tool.types';
import { PersonalContextService } from './personal-context.service';

const NO_OWNER = {
  output: {
    ok: false,
    error: 'assistente_nao_configurado',
    message:
      'Este assistente pessoal não está vinculado a um usuário (PersonalAssistantConfig). Provisione o assistente antes.',
  },
};

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class CreatePersonalTaskTool implements AiTool {
  readonly name = 'createPersonalTask';
  readonly description =
    'Cria uma tarefa pessoal do usuário (com prazo opcional). Use para registrar algo a fazer.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: { type: 'string', description: 'Título curto da tarefa.' },
      notes: { type: 'string', description: 'Detalhes opcionais.' },
      dueAt: {
        type: 'string',
        description: 'Prazo em ISO 8601 (ex: 2026-06-30T14:00:00-03:00). Opcional.',
      },
      priority: {
        type: 'integer',
        description: 'Prioridade: 1=alta, 2=média, 3=baixa. Opcional.',
        minimum: 1,
        maximum: 3,
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
    if (!title) return { output: { ok: false, error: 'title é obrigatório' } };

    const task = await this.prisma.personalTask.create({
      data: {
        organizationId: ctx.organizationId,
        userId,
        title,
        notes: input.notes ? String(input.notes) : null,
        dueAt: parseDate(input.dueAt),
        priority:
          input.priority != null ? Number(input.priority) : null,
      },
      select: { id: true, title: true, dueAt: true },
    });
    return { output: { ok: true, task } };
  }
}

@Injectable()
export class ListPersonalTasksTool implements AiTool {
  readonly name = 'listPersonalTasks';
  readonly description =
    'Lista as tarefas pessoais do usuário, opcionalmente filtrando por status.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: {
        type: 'string',
        enum: ['TODO', 'DOING', 'DONE', 'CANCELLED'],
        description: 'Filtra por status. Omita para ver as abertas (TODO+DOING).',
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
    const status = String(input.status ?? '');
    const where: any = { organizationId: ctx.organizationId, userId };
    if (['TODO', 'DOING', 'DONE', 'CANCELLED'].includes(status)) {
      where.status = status;
    } else {
      where.status = { in: ['TODO', 'DOING'] };
    }
    const tasks = await this.prisma.personalTask.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      select: { id: true, title: true, status: true, dueAt: true, priority: true },
    });
    return { output: { ok: true, count: tasks.length, tasks } };
  }
}

@Injectable()
export class UpdatePersonalTaskTool implements AiTool {
  readonly name = 'updatePersonalTask';
  readonly description =
    'Atualiza uma tarefa pessoal: muda status (inclui concluir com DONE), título, notas ou prazo.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['taskId'],
    properties: {
      taskId: { type: 'string', description: 'ID da tarefa (de listPersonalTasks).' },
      status: {
        type: 'string',
        enum: ['TODO', 'DOING', 'DONE', 'CANCELLED'],
        description: 'Novo status. DONE conclui a tarefa.',
      },
      title: { type: 'string', description: 'Novo título.' },
      notes: { type: 'string', description: 'Novas notas.' },
      dueAt: { type: 'string', description: 'Novo prazo (ISO 8601) ou vazio para remover.' },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly personal: PersonalContextService,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const userId = await this.personal.resolveUserId(ctx);
    if (!userId) return NO_OWNER;
    const taskId = String(input.taskId ?? '');
    // Escopo por (org+user): não deixa mexer em tarefa de outro usuário.
    const existing = await this.prisma.personalTask.findFirst({
      where: { id: taskId, organizationId: ctx.organizationId, userId },
      select: { id: true },
    });
    if (!existing) return { output: { ok: false, error: 'tarefa não encontrada' } };

    const data: any = {};
    if (input.status) data.status = input.status;
    if (input.title) data.title = String(input.title);
    if (input.notes !== undefined) data.notes = input.notes ? String(input.notes) : null;
    if (input.dueAt !== undefined) data.dueAt = parseDate(input.dueAt);
    if (input.status === 'DONE') data.completedAt = new Date();

    const task = await this.prisma.personalTask.update({
      where: { id: taskId },
      data,
      select: { id: true, title: true, status: true, dueAt: true },
    });
    return { output: { ok: true, task } };
  }
}
