import { api } from '@/lib/api';

export interface OrganizationSecret {
  id?: string;
  organizationId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSecretInput {
  key: string;
  value: string;
}

export const secretsService = {
  async list(): Promise<OrganizationSecret[]> {
    const { data } = await api.get('/ai-catalog/secrets');
    return data.data ?? data;
  },

  async findValue(key: string): Promise<string> {
    const { data } = await api.get<{ key: string; value: string }>(
      `/ai-catalog/secrets/${encodeURIComponent(key)}`,
    );
    return data.value;
  },

  async upsert(input: UpsertSecretInput): Promise<OrganizationSecret> {
    const { data } = await api.put('/ai-catalog/secrets', input);
    return data.data ?? data;
  },

  async remove(key: string): Promise<void> {
    await api.delete(`/ai-catalog/secrets/${encodeURIComponent(key)}`);
  },
};
