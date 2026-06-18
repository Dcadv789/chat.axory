import { api } from '@/lib/api';

export interface AiModelProvider {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  modelId: string;
  apiKey: string | null;
  baseUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiModelProviderInput {
  provider: string;
  name: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface UpdateAiModelProviderInput {
  provider?: string;
  name?: string;
  modelId?: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  isActive?: boolean;
}

export const aiModelProvidersService = {
  async list(): Promise<AiModelProvider[]> {
    const { data } = await api.get('/organizations/current/ai-models');
    return data.data ?? data;
  },

  async create(input: CreateAiModelProviderInput): Promise<AiModelProvider> {
    const { data } = await api.post('/organizations/current/ai-models', input);
    return data.data ?? data;
  },

  async update(id: string, input: UpdateAiModelProviderInput): Promise<AiModelProvider> {
    const { data } = await api.patch(`/organizations/current/ai-models/${id}`, input);
    return data.data ?? data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/organizations/current/ai-models/${id}`);
  },
};
