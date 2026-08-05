import { api } from '@/lib/api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferenceItem {
  type: string;
  inApp: boolean;
  browserPush: boolean;
  sound: boolean;
}

export interface NotificationPreferences {
  preferences: NotificationPreferenceItem[];
  dndEnabled: boolean;
  dndStart: string | null;
  dndEnd: string | null;
}

export const notificationsSettingsService = {
  async getPreferences(): Promise<NotificationPreferences> {
    const { data } = await api.get('/notifications/preferences');
    return data.data ?? data;
  },
  async savePreferences(
    input: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    const { data } = await api.put('/notifications/preferences', input);
    return data.data ?? data;
  },
  async list(page = 1, limit = 20): Promise<{
    notifications: Notification[];
    unreadCount: number;
    pagination: any;
  }> {
    const { data } = await api.get('/notifications', { params: { page, limit } });
    return data.data;
  },
  async markRead(id: string): Promise<void> {
    await api.patch(`/notifications/${id}/read`);
  },
  async markAllRead(): Promise<void> {
    await api.patch('/notifications/read-all');
  },
  async getUnreadCount(): Promise<number> {
    const { data } = await api.get('/notifications/unread-count');
    return data.data;
  },
};
