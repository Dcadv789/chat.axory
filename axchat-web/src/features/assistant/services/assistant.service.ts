import { api } from '@/lib/api';

export interface PersonalTask {
  id: string;
  title: string;
  notes: string | null;
  status: 'TODO' | 'DOING' | 'DONE' | 'CANCELLED';
  priority: number | null;
  dueAt: string | null;
  createdAt: string;
}
export interface PersonalNote {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
}
export interface PersonalReminder {
  id: string;
  message: string;
  remindAt: string;
  status: string;
}
export interface PersonalEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  source: string;
}
export interface AssistantOverview {
  config: { id: string; agentId: string | null; channelId: string | null; timezone: string } | null;
  conversationId: string | null;
  metrics: {
    tasksOpen: number;
    tasksDone: number;
    notesCount: number;
    remindersPending: number;
    eventsUpcoming: number;
  };
  tasks: PersonalTask[];
  reminders: PersonalReminder[];
  events: PersonalEvent[];
}

export const assistantService = {
  /** Config leve — usada pelo inbox pra detectar a conversa do assistente. */
  async config(): Promise<{ id: string; channelId: string | null; agentId: string | null } | null> {
    const { data } = await api.get('/personal-assistant/config');
    return data?.data ?? data ?? null;
  },
  async overview(): Promise<AssistantOverview> {
    const { data } = await api.get('/personal-assistant/overview');
    return data?.data ?? data;
  },
  async createTask(input: { title: string; notes?: string; dueAt?: string; priority?: number }) {
    const { data } = await api.post('/personal-assistant/tasks', input);
    return data?.data ?? data;
  },
  async updateTask(id: string, input: { status?: string; title?: string; dueAt?: string | null }) {
    const { data } = await api.patch(`/personal-assistant/tasks/${id}`, input);
    return data?.data ?? data;
  },
  async deleteTask(id: string) {
    await api.delete(`/personal-assistant/tasks/${id}`);
  },
  async listNotes(): Promise<PersonalNote[]> {
    const { data } = await api.get('/personal-assistant/notes');
    return data?.data ?? data;
  },
  async createNote(input: { content: string; tags?: string[] }) {
    const { data } = await api.post('/personal-assistant/notes', input);
    return data?.data ?? data;
  },
  async deleteNote(id: string) {
    await api.delete(`/personal-assistant/notes/${id}`);
  },
  async createEvent(input: { title: string; startAt: string; endAt?: string; location?: string }) {
    const { data } = await api.post('/personal-assistant/events', input);
    return data?.data ?? data;
  },
  async cancelReminder(id: string) {
    await api.delete(`/personal-assistant/reminders/${id}`);
  },
  async listChannels(): Promise<{
    channels: { id: string; name: string; type: string; isPrimary: boolean }[];
    available: { id: string; name: string; type: string }[];
  }> {
    const { data } = await api.get('/personal-assistant/channels');
    return data?.data ?? data;
  },
  async addChannel(channelId: string) {
    await api.post('/personal-assistant/channels', { channelId });
  },
  async removeChannel(channelId: string) {
    await api.delete(`/personal-assistant/channels/${channelId}`);
  },
};
