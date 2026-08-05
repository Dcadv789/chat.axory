import { api } from '@/lib/api';

export interface AiModelProvider {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  modelId: string;
  /** A chave nunca volta do backend — só o flag e um preview mascarado. */
  apiKeySet: boolean;
  apiKeyPreview: string | null;
  baseUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Modelo pré-definido oferecido pela tela "Adicionar IA". */
export interface CatalogModel {
  modelId: string;
  label: string;
  hint?: string;
}

/**
 * Motor de IA disponível no catálogo do backend (fonte única da verdade).
 * `requiresManualSetup` = o usuário digita nome/base-URL/modelId à mão
 * (só o "Personalizado"); nos demais o backend resolve a base-URL sozinho.
 */
export interface CatalogProvider {
  id: string;
  label: string;
  transport: 'anthropic' | 'openai-compat';
  defaultBaseUrl: string | null;
  requiresManualSetup: boolean;
  keyHint: string;
  models: CatalogModel[];
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
  /** Omitir = não troca a chave. `null` = remove. */
  apiKey?: string | null;
  baseUrl?: string | null;
  isActive?: boolean;
}

export const aiModelProvidersService = {
  async list(): Promise<AiModelProvider[]> {
    const { data } = await api.get('/organizations/current/ai-models');
    return data.data ?? data;
  },

  async catalog(): Promise<CatalogProvider[]> {
    const { data } = await api.get('/organizations/current/ai-model-catalog');
    const payload = data.data ?? data;
    return payload?.providers ?? [];
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

  async testConnection(id: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const { data } = await api.post(`/organizations/current/ai-models/${id}/test`);
    return data.data ?? data;
  },
};
