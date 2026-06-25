import { api } from '@/lib/api';

export interface AgentCron {
  id: string;
  organizationId: string;
  agentId: string;
  name: string;
  task: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastStatus: string | null;
  lastError: string | null;
  nextRunAt: string | null;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string; kind: string };
}

export interface CreateCronInput {
  agentId: string;
  name: string;
  task: string;
  cronExpression: string;
  timezone?: string;
  isActive?: boolean;
}

export type UpdateCronInput = Partial<Omit<CreateCronInput, 'agentId'>>;

export const cronsService = {
  async list(): Promise<AgentCron[]> {
    const { data } = await api.get('/agent-crons');
    return data.data ?? data;
  },

  async create(input: CreateCronInput): Promise<AgentCron> {
    const { data } = await api.post('/agent-crons', input);
    return data.data ?? data;
  },

  async update(id: string, input: UpdateCronInput): Promise<AgentCron> {
    const { data } = await api.patch(`/agent-crons/${id}`, input);
    return data.data ?? data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/agent-crons/${id}`);
  },

  async runNow(id: string): Promise<void> {
    await api.post(`/agent-crons/${id}/run-now`);
  },
};
