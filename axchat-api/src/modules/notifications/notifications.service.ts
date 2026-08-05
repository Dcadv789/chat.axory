import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { NotificationsRepository } from './notifications.repository';
import { PrismaService } from '../../database/prisma.service';
import { SaveNotificationPreferencesDto } from './dto/save-notification-preferences.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notifQueue: Queue,
  ) {}

  async notify(params: {
    recipientId: string;
    organizationId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, any>;
  }) {
    const pref = await this.resolvePreference(
      params.recipientId,
      params.organizationId,
      params.type,
    );

    // In-app desligado = o usuário não quer esse tipo no sininho. Sem registro,
    // sem entrega — é o único jeito de a preferência significar alguma coisa.
    if (!pref.inApp) {
      this.logger.debug(
        `Notificação ${params.type} suprimida por preferência do user ${params.recipientId}`,
      );
      return null;
    }

    const notification = await this.repository.create({
      recipientId: params.recipientId,
      organizationId: params.organizationId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data || {},
    });

    // Dentro do "Não perturbe" a notificação existe no sininho, mas chega
    // silenciosa: sem push no navegador e sem som.
    const quietNow = await this.isWithinDnd(
      params.organizationId,
      pref.dndStart,
      pref.dndEnd,
    );

    await this.notifQueue.add('deliver', {
      notificationId: notification.id,
      recipientId: params.recipientId,
      organizationId: params.organizationId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
      browserPush: pref.browserPush && !quietNow,
      sound: pref.sound && !quietNow,
    });

    return notification;
  }

  /** Preferência do usuário pro tipo, com default "tudo ligado" se nunca salvou. */
  private async resolvePreference(
    userId: string,
    orgId: string,
    type: NotificationType,
  ) {
    try {
      const saved = await this.repository.findPreference(userId, orgId, type);
      if (saved) return saved;
    } catch (err) {
      this.logger.warn(
        `Falha ao ler preferência de notificação (user ${userId}, tipo ${type}): ${(err as Error).message}`,
      );
    }
    return {
      inApp: true,
      browserPush: true,
      sound: true,
      dndStart: null as string | null,
      dndEnd: null as string | null,
    };
  }

  /**
   * A janela "HH:mm–HH:mm" está ativa agora? Trata a virada de dia
   * (ex.: 22:00→08:00, que atravessa a meia-noite).
   *
   * O horário é comparado no FUSO DA ORGANIZAÇÃO (`aiTimezone`), não no do
   * servidor — a API roda em UTC e usar a hora local dela jogaria a janela 3h
   * fora pra quem está em São Paulo. Só consulta o banco quando o DND está
   * configurado, então o caminho comum não paga nada.
   */
  private async isWithinDnd(
    orgId: string,
    start: string | null,
    end: string | null,
  ): Promise<boolean> {
    if (!start || !end) return false;

    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const from = toMinutes(start);
    const to = toMinutes(end);
    if (Number.isNaN(from) || Number.isNaN(to) || from === to) return false;

    const minutes = await this.minutesNowInOrgTz(orgId);
    return from < to
      ? minutes >= from && minutes < to
      : minutes >= from || minutes < to;
  }

  /** Minutos desde a meia-noite AGORA, no fuso configurado da organização. */
  private async minutesNowInOrgTz(orgId: string): Promise<number> {
    let timeZone = 'America/Sao_Paulo';
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { aiTimezone: true },
      });
      if (org?.aiTimezone) timeZone = org.aiTimezone;
    } catch {
      // fuso default já cobre; não vale derrubar a notificação por causa disso
    }
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());
      // hour12:false devolve "24" pra meia-noite em algumas versões do ICU.
      const hour =
        Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
      const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
      return hour * 60 + minute;
    } catch (err) {
      this.logger.warn(
        `Fuso inválido "${timeZone}" na org ${orgId}: ${(err as Error).message}`,
      );
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    }
  }

  async getPreferences(userId: string, orgId: string) {
    const rows = await this.repository.findPreferences(userId, orgId);
    const withDnd = rows.find((r) => r.dndStart && r.dndEnd);
    return {
      preferences: rows.map((r) => ({
        type: r.type,
        inApp: r.inApp,
        browserPush: r.browserPush,
        sound: r.sound,
      })),
      dndEnabled: !!withDnd,
      dndStart: withDnd?.dndStart ?? null,
      dndEnd: withDnd?.dndEnd ?? null,
    };
  }

  async savePreferences(
    userId: string,
    orgId: string,
    dto: SaveNotificationPreferencesDto,
  ) {
    const dnd =
      dto.dndEnabled && dto.dndStart && dto.dndEnd
        ? { start: dto.dndStart, end: dto.dndEnd }
        : { start: null, end: null };

    await this.repository.savePreferences(
      userId,
      orgId,
      dto.preferences,
      dnd,
    );
    return this.getPreferences(userId, orgId);
  }

  async notifyOrgAgents(params: {
    organizationId: string;
    excludeUserId?: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, any>;
  }) {
    const members = await this.prisma.userOrganization.findMany({
      where: { organizationId: params.organizationId },
      select: { userId: true },
    });

    const recipients = members
      .map((m) => m.userId)
      .filter((id) => id !== params.excludeUserId);

    for (const recipientId of recipients) {
      await this.notify({
        recipientId,
        organizationId: params.organizationId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data,
      });
    }
  }

  async findByUser(userId: string, orgId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { notifications, total } = await this.repository.findByUser(userId, orgId, skip, limit);
    const unreadCount = await this.repository.countUnread(userId, orgId);
    return {
      notifications,
      unreadCount,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async markRead(id: string) {
    return this.repository.markRead(id);
  }

  async markAllRead(userId: string, orgId: string) {
    return this.repository.markAllRead(userId, orgId);
  }

  async getUnreadCount(userId: string, orgId: string) {
    return this.repository.countUnread(userId, orgId);
  }
}
