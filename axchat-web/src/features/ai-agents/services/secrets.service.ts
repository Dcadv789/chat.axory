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

export interface IntegrationCheck {
  name: string;
  ok: boolean;
  message: string;
  keys: string[];
}

export interface IntegrationTestResult {
  provider: string;
  checks: IntegrationCheck[];
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

  async test(provider: string): Promise<IntegrationTestResult> {
    const { data } = await api.post<IntegrationTestResult>(
      `/ai-catalog/secrets/test/${encodeURIComponent(provider)}`,
    );
    return (data as any).data ?? data;
  },
};
