import { api } from '@/lib/api';

export interface QuickReply {
  id: string;
  organizationId: string;
  shortcut: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const quickRepliesService = {
  async list(): Promise<QuickReply[]> {
    const { data } = await api.get('/quick-replies');
    return data.data;
  },
  async create(payload: { shortcut: string; title: string; content: string }): Promise<QuickReply> {
    const { data } = await api.post('/quick-replies', payload);
    return data.data;
  },
  async update(id: string, payload: { shortcut?: string; title?: string; content?: string }): Promise<QuickReply> {
    const { data } = await api.patch(`/quick-replies/${id}`, payload);
    return data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/quick-replies/${id}`);
  },
};
