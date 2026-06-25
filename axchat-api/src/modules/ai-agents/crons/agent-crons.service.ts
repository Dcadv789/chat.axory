import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service';
import { CreateAgentCronDto } from './dto/create-agent-cron.dto';
import { UpdateAgentCronDto } from './dto/update-agent-cron.dto';
import { computeNextRun, isValidCronExpression } from './cron-expression.util';
import { AGENT_CRON_RUN_NOW_JOB } from './agent-cron.types';

const DEFAULT_TZ = 'America/Sao_Paulo';

@Injectable()
export class AgentCronsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('agent-crons') private readonly queue: Queue,
  ) {}

  async list(organizationId: string) {
    return this.prisma.agentCron.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { agent: { select: { id: true, name: true, kind: true } } },
    });
  }

  async findOne(organizationId: string, id: string) {
    const cron = await this.prisma.agentCron.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { agent: { select: { id: true, name: true, kind: true } } },
    });
    if (!cron) throw new NotFoundException('Cron não encontrado.');
    return cron;
  }

  async create(organizationId: string, dto: CreateAgentCronDto) {
    const agent = await this.prisma.aiAgent.findFirst({
      where: { id: dto.agentId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!agent) throw new BadRequestException('Agente não encontrado nesta organização.');

    const timezone = dto.timezone || DEFAULT_TZ;
    const nextRunAt = this.safeNextRun(dto.cronExpression, timezone);

    return this.prisma.agentCron.create({
      data: {
        organizationId,
        agentId: dto.agentId,
        name: dto.name,
        task: dto.task,
        cronExpression: dto.cronExpression,
        timezone,
        isActive: dto.isActive ?? true,
        nextRunAt,
      },
      include: { agent: { select: { id: true, name: true, kind: true } } },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateAgentCronDto) {
    await this.findOne(organizationId, id);

    const data: Record<string, unknown> = { ...dto };

    // Recalcula nextRunAt se a expressão, o timezone ou o estado mudou.
    if (dto.cronExpression !== undefined || dto.timezone !== undefined || dto.isActive !== undefined) {
      const current = await this.prisma.agentCron.findUniqueOrThrow({ where: { id } });
      const expr = dto.cronExpression ?? current.cronExpression;
      const tz = dto.timezone ?? current.timezone;
      const active = dto.isActive ?? current.isActive;
      data.nextRunAt = active ? this.safeNextRun(expr, tz) : null;
    }

    return this.prisma.agentCron.update({
      where: { id },
      data,
      include: { agent: { select: { id: true, name: true, kind: true } } },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.agentCron.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, nextRunAt: null },
    });
    return { ok: true };
  }

  /** Dispara já, sem esperar o agendamento (botão "Rodar agora"). */
  async runNow(organizationId: string, id: string) {
    const cron = await this.findOne(organizationId, id);
    await this.queue.add(
      AGENT_CRON_RUN_NOW_JOB,
      { cronId: cron.id },
      { removeOnComplete: true, removeOnFail: 50 },
    );
    return { ok: true, queued: true };
  }

  private safeNextRun(expression: string, timezone: string): Date | null {
    if (!isValidCronExpression(expression)) {
      throw new BadRequestException('Expressão cron inválida.');
    }
    return computeNextRun(expression, new Date(), timezone);
  }
}
