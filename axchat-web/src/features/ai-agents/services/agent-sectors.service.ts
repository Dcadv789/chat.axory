import { api } from '@/lib/api';

export interface AgentSector {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  agents: AgentSectorAgentLink[];
}

export interface AgentSectorAgentLink {
  sectorId: string;
  agentId: string;
  agent: {
    id: string;
    name: string;
    kind: string;
    department: string | null;
    modelId: string;
    isActive: boolean;
  };
}

export interface CreateAgentSectorInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface UpdateAgentSectorInput {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}

export const agentSectorsService = {
  async list(): Promise<AgentSector[]> {
    const { data } = await api.get('/agent-sectors');
    return data.data ?? data;
  },

  async getById(id: string): Promise<AgentSector> {
    const { data } = await api.get(`/agent-sectors/${id}`);
    return data.data ?? data;
  },

  async create(input: CreateAgentSectorInput): Promise<AgentSector> {
    const { data } = await api.post('/agent-sectors', input);
    return data.data ?? data;
  },

  async update(id: string, input: UpdateAgentSectorInput): Promise<AgentSector> {
    const { data } = await api.patch(`/agent-sectors/${id}`, input);
    return data.data ?? data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/agent-sectors/${id}`);
  },

  async addAgent(sectorId: string, agentId: string): Promise<AgentSector> {
    const { data } = await api.post(`/agent-sectors/${sectorId}/agents`, { agentId });
    return data.data ?? data;
  },

  async removeAgent(sectorId: string, agentId: string): Promise<void> {
    await api.delete(`/agent-sectors/${sectorId}/agents/${agentId}`);
  },

  async reorder(sectorIds: string[]): Promise<AgentSector[]> {
    const { data } = await api.patch('/agent-sectors/reorder', { sectorIds });
    return data.data ?? data;
  },
};
