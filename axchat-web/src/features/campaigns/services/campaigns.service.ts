import { api } from '@/lib/api';

export type CampaignStatus = 'DRAFT' | 'SENDING' | 'COMPLETED' | 'CANCELED' | 'FAILED';
export type RecipientStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface Campaign {
  id: string;
  name: string;
  channelId: string;
  channelType: string;
  status: CampaignStatus;
  messageType: 'TEXT' | 'TEMPLATE';
  content: Record<string, any>;
  audience: { mode: 'all' | 'tag' | 'campaign'; tagId?: string; campaign?: string };
  total: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  _count?: { recipients: number };
  recipients?: CampaignRecipient[];
}

export interface CampaignRecipient {
  id: string;
  contactId: string;
  name: string | null;
  externalId: string | null;
  status: RecipientStatus;
  error: string | null;
  sentAt: string | null;
}

export interface CreateCampaignInput {
  name: string;
  channelId: string;
  messageType: 'TEXT' | 'TEMPLATE';
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  templateBodyParams?: string[];
  audience: { mode: 'all' | 'tag' | 'campaign'; tagId?: string; campaign?: string };
}

export const campaignsService = {
  async list(): Promise<Campaign[]> {
    const { data } = await api.get('/campaigns');
    return (data.data ?? data)?.campaigns ?? [];
  },
  async get(id: string): Promise<Campaign> {
    const { data } = await api.get(`/campaigns/${id}`);
    return data.data ?? data;
  },
  async previewAudience(audience: CreateCampaignInput['audience']): Promise<number> {
    const { data } = await api.post('/campaigns/preview-audience', audience);
    return (data.data ?? data)?.count ?? 0;
  },
  async create(input: CreateCampaignInput): Promise<Campaign> {
    const { data } = await api.post('/campaigns', input);
    return data.data ?? data;
  },
  async send(id: string): Promise<{ ok: boolean; queued: number }> {
    const { data } = await api.post(`/campaigns/${id}/send`);
    return data.data ?? data;
  },
  async cancel(id: string): Promise<void> {
    await api.post(`/campaigns/${id}/cancel`);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/campaigns/${id}`);
  },
};
