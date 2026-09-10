import { api } from '@/lib/api';

/** Conhecimento estruturado da empresa — vale pra todos os agentes do tenant. */
export interface CompanyKnowledge {
  whatWeDo: string | null;
  products: string | null;
  targetAudience: string | null;
  differentials: string | null;
  toneOfVoice: string | null;
  guidelines: string | null;
  restrictions: string | null;
  serviceHours: string | null;
  faq: string | null;
}

export type UpsertCompanyKnowledgeInput = Partial<
  Record<keyof CompanyKnowledge, string>
>;

export interface KnowledgeDocument {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  sectorId: string | null;
  sector: { id: string; name: string } | null;
  isActive: boolean;
}

export interface UpsertKnowledgeDocumentInput {
  title: string;
  summary?: string;
  content: string;
  sectorId?: string | null;
  isActive?: boolean;
}

export const knowledgeService = {
  async getCompany(): Promise<CompanyKnowledge | null> {
    const { data } = await api.get('/knowledge/company');
    return data?.data ?? data ?? null;
  },

  async upsertCompany(
    input: UpsertCompanyKnowledgeInput,
  ): Promise<CompanyKnowledge> {
    const { data } = await api.put('/knowledge/company', input);
    return data?.data ?? data;
  },

  async setSectorKnowledge(sectorId: string, knowledge: string) {
    const { data } = await api.put(`/knowledge/sectors/${sectorId}`, {
      knowledge,
    });
    return data?.data ?? data;
  },

  async listDocuments(): Promise<KnowledgeDocument[]> {
    const { data } = await api.get('/knowledge/documents');
    return data?.data ?? data ?? [];
  },

  async createDocument(
    input: UpsertKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const { data } = await api.post('/knowledge/documents', input);
    return data?.data ?? data;
  },

  async updateDocument(
    id: string,
    input: UpsertKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const { data } = await api.put(`/knowledge/documents/${id}`, input);
    return data?.data ?? data;
  },

  async removeDocument(id: string): Promise<void> {
    await api.delete(`/knowledge/documents/${id}`);
  },
};
