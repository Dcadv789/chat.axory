import { Injectable } from '@nestjs/common';
import { Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.NotificationUncheckedCreateInput) {
    return this.prisma.notification.create({ data });
  }

  async findByUser(userId: string, orgId: string, skip: number, take: number) {
    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { recipientId: userId, organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({
        where: { recipientId: userId, organizationId: orgId },
      }),
    ]);
    return { notifications, total };
  }

  async countUnread(userId: string, orgId: string) {
    return this.prisma.notification.count({
      where: { recipientId: userId, organizationId: orgId, isRead: false },
    });
  }

  async markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string, orgId: string) {
    return this.prisma.notification.updateMany({
      where: { recipientId: userId, organizationId: orgId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  // ─── Preferências ────────────────────────────────

  async findPreferences(userId: string, orgId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId, organizationId: orgId },
    });
  }

  /**
   * Preferência de UM tipo. `null` = usuário nunca salvou nada → o chamador
   * decide o default (hoje: tudo ligado).
   */
  async findPreference(userId: string, orgId: string, type: NotificationType) {
    return this.prisma.notificationPreference.findUnique({
      where: {
        userId_organizationId_type: { userId, organizationId: orgId, type },
      },
    });
  }

  /**
   * Grava a matriz inteira de uma vez. O "Não perturbe" é global do usuário,
   * mas a tabela guarda por tipo — então repetimos a janela em todas as linhas
   * e a leitura pega de qualquer uma.
   */
  async savePreferences(
    userId: string,
    orgId: string,
    items: Array<{
      type: NotificationType;
      inApp: boolean;
      browserPush: boolean;
      sound: boolean;
    }>,
    dnd: { start: string | null; end: string | null },
  ) {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_organizationId_type: {
              userId,
              organizationId: orgId,
              type: item.type,
            },
          },
          create: {
            userId,
            organizationId: orgId,
            type: item.type,
            inApp: item.inApp,
            browserPush: item.browserPush,
            sound: item.sound,
            dndStart: dnd.start,
            dndEnd: dnd.end,
          },
          update: {
            inApp: item.inApp,
            browserPush: item.browserPush,
            sound: item.sound,
            dndStart: dnd.start,
            dndEnd: dnd.end,
          },
        }),
      ),
    );
  }
}
