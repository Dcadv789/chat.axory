import { api } from '@/lib/api';

export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  notes: string | null;
  campaign: string | null;
  source: string | null;
  metadata: Record<string, any>;
  channels: { id: string; channelId: string; externalId: string; channel: { id: string; type: string; name: string } }[];
  tags: { tag: { id: string; name: string; color: string } }[];
  contactNotes: { id: string; content: string; createdAt: string; author: { id: string; name: string; avatarUrl: string | null } }[];
  conversations?: any[];
  _count?: { conversations: number };
  createdAt: string;
}

export interface ImportContactRow {
  name?: string;
  phone?: string;
  email?: string;
  campaign?: string;
  tags?: string[];
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  errors: string[];
}

export const contactsService = {
  async list(params?: Record<string, string>): Promise<{
    contacts: Contact[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { data } = await api.get('/contacts', { params });
    return data.data;
  },

  async getById(id: string): Promise<Contact> {
    const { data } = await api.get(`/contacts/${id}`);
    return data.data;
  },

  async update(
    id: string,
    payload: Partial<Contact> & { tagIds?: string[] },
  ): Promise<Contact> {
    const { data } = await api.patch(`/contacts/${id}`, payload);
    return data.data;
  },

  async create(payload: {
    name?: string;
    phone?: string;
    email?: string;
    campaign?: string;
    tags?: string[];
  }): Promise<Contact> {
    const { data } = await api.post('/contacts', payload);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/contacts/${id}`);
  },

  async listCampaigns(): Promise<string[]> {
    const { data } = await api.get('/contacts/campaigns');
    return (data.data ?? data)?.campaigns ?? [];
  },

  async importContacts(
    contacts: ImportContactRow[],
    campaign?: string,
  ): Promise<ImportResult> {
    const { data } = await api.post('/contacts/import', { contacts, campaign });
    return data.data ?? data;
  },

  // ─── Notes ──────────────────────────────────────
  async listNotes(contactId: string): Promise<any[]> {
    const { data } = await api.get(`/contacts/${contactId}/notes`);
    return data.data ?? data;
  },

  async addNote(contactId: string, content: string): Promise<any> {
    const { data } = await api.post(`/contacts/${contactId}/notes`, { content });
    return data.data ?? data;
  },

  async deleteNote(contactId: string, noteId: string): Promise<void> {
    await api.delete(`/contacts/${contactId}/notes/${noteId}`);
  },
};
