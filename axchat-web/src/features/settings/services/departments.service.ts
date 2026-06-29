import { api } from '@/lib/api';

export type DistributionRule = 'ROUND_ROBIN' | 'LEAST_BUSY' | 'MANUAL';

export interface Department {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  distributionRule: DistributionRule;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentAgent {
  id: string;
  departmentId: string;
  userOrganizationId: string;
  isActive: boolean;
  userOrganization: {
    id: string;
    role: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
  };
}

export interface CreateDepartmentInput {
  name: string;
  description?: string;
  isDefault?: boolean;
}

export interface UpdateDepartmentInput {
  name?: string;
  description?: string | null;
  isDefault?: boolean;
}

export const departmentsService = {
  async list(): Promise<Department[]> {
    const { data } = await api.get('/departments');
    return data.data ?? data;
  },
  async create(input: CreateDepartmentInput): Promise<Department> {
    const { data } = await api.post('/departments', input);
    return data.data ?? data;
  },
  async update(id: string, input: UpdateDepartmentInput): Promise<Department> {
    const { data } = await api.patch(`/departments/${id}`, input);
    return data.data ?? data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/departments/${id}`);
  },
  async listAgents(id: string): Promise<DepartmentAgent[]> {
    const { data } = await api.get(`/departments/${id}/agents`);
    return data.data ?? data;
  },
  async addAgent(id: string, userId: string): Promise<void> {
    await api.post(`/departments/${id}/agents`, { userId });
  },
  async removeAgent(id: string, userId: string): Promise<void> {
    await api.delete(`/departments/${id}/agents/${userId}`);
  },
};
