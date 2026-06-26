import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Dados pessoais do USUÁRIO logado (dono do assistente). Tudo escopado por
 * (organizationId + userId) — cada um só acessa o que é seu.
 */
@Injectable()
export class PersonalAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  /** Painel: config + conversa do chat + métricas isoladas + listas recentes. */
  async overview(organizationId: string, userId: string) {
    const config = await this.prisma.personalAssistantConfig.findUnique({
      where: { uq_assistant_org_user: { organizationId, userId } },
    });

    let conversationId: string | null = null;
    if (config?.channelId) {
      const conv = await this.prisma.conversation.findFirst({
        where: { channelId: config.channelId, deletedAt: null },
        select: { id: true },
      });
      conversationId = conv?.id ?? null;
    }

    const scope = { organizationId, userId };
    const [
      tasksOpen,
      tasksDone,
      notesCount,
      remindersPending,
      eventsUpcoming,
      tasks,
      reminders,
      events,
    ] = await Promise.all([
      this.prisma.personalTask.count({ where: { ...scope, status: { in: ['TODO', 'DOING'] } } }),
      this.prisma.personalTask.count({ where: { ...scope, status: 'DONE' } }),
      this.prisma.personalNote.count({ where: scope }),
      this.prisma.personalReminder.count({ where: { ...scope, status: 'PENDING' } }),
      this.prisma.personalCalendarEvent.count({
        where: { ...scope, startAt: { gte: new Date() } },
      }),
      this.prisma.personalTask.findMany({
        where: { ...scope, status: { in: ['TODO', 'DOING'] } },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 20,
      }),
      this.prisma.personalReminder.findMany({
        where: { ...scope, status: 'PENDING' },
        orderBy: { remindAt: 'asc' },
        take: 20,
      }),
      this.prisma.personalCalendarEvent.findMany({
        where: { ...scope, startAt: { gte: new Date() } },
        orderBy: { startAt: 'asc' },
        take: 20,
      }),
    ]);

    return {
      config,
      conversationId,
      metrics: { tasksOpen, tasksDone, notesCount, remindersPending, eventsUpcoming },
      tasks,
      reminders,
      events,
    };
  }

  listTasks(organizationId: string, userId: string) {
    return this.prisma.personalTask.findMany({
      where: { organizationId, userId },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  createTask(
    organizationId: string,
    userId: string,
    data: { title: string; notes?: string; dueAt?: string; priority?: number },
  ) {
    return this.prisma.personalTask.create({
      data: {
        organizationId,
        userId,
        title: data.title,
        notes: data.notes ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        priority: data.priority ?? null,
      },
    });
  }

  async updateTask(
    organizationId: string,
    userId: string,
    id: string,
    data: { title?: string; notes?: string; dueAt?: string | null; status?: string },
  ) {
    // Escopo: só atualiza tarefa do próprio usuário.
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.dueAt !== undefined) updateData.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'DONE') updateData.completedAt = new Date();
    }
    const r = await this.prisma.personalTask.updateMany({
      where: { id, organizationId, userId },
      data: updateData,
    });
    return { ok: r.count > 0 };
  }

  async deleteTask(organizationId: string, userId: string, id: string) {
    const r = await this.prisma.personalTask.deleteMany({
      where: { id, organizationId, userId },
    });
    return { ok: r.count > 0 };
  }

  listNotes(organizationId: string, userId: string) {
    return this.prisma.personalNote.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  createNote(
    organizationId: string,
    userId: string,
    data: { content: string; tags?: string[] },
  ) {
    return this.prisma.personalNote.create({
      data: {
        organizationId,
        userId,
        content: data.content,
        tags: data.tags ?? [],
      },
    });
  }

  async deleteNote(organizationId: string, userId: string, id: string) {
    const r = await this.prisma.personalNote.deleteMany({
      where: { id, organizationId, userId },
    });
    return { ok: r.count > 0 };
  }

  listEvents(organizationId: string, userId: string) {
    return this.prisma.personalCalendarEvent.findMany({
      where: { organizationId, userId, startAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      orderBy: { startAt: 'asc' },
      take: 200,
    });
  }

  createEvent(
    organizationId: string,
    userId: string,
    data: { title: string; startAt: string; endAt?: string; location?: string; description?: string },
  ) {
    return this.prisma.personalCalendarEvent.create({
      data: {
        organizationId,
        userId,
        title: data.title,
        startAt: new Date(data.startAt),
        endAt: data.endAt ? new Date(data.endAt) : null,
        location: data.location ?? null,
        description: data.description ?? null,
        source: 'NATIVE',
      },
    });
  }

  async updateConfig(
    organizationId: string,
    userId: string,
    data: { dailyBriefingHour?: number | null; timezone?: string },
  ) {
    const update: any = {};
    if (data.dailyBriefingHour !== undefined) {
      update.dailyBriefingHour =
        data.dailyBriefingHour === null
          ? null
          : Math.max(0, Math.min(23, Number(data.dailyBriefingHour)));
    }
    if (data.timezone) update.timezone = data.timezone;
    return this.prisma.personalAssistantConfig.update({
      where: { uq_assistant_org_user: { organizationId, userId } },
      data: update,
    });
  }

  async cancelReminder(organizationId: string, userId: string, id: string) {
    const r = await this.prisma.personalReminder.updateMany({
      where: { id, organizationId, userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return { ok: r.count > 0 };
  }
}
