/**
 * Catálogo de motores de IA que a organização pode plugar ("Adicionar IA").
 *
 * Fonte ÚNICA da verdade: o front renderiza a partir daqui (via endpoint) e o
 * runtime resolve a base-URL a partir daqui também. Isso evita o problema do
 * formulário livre antigo, onde dava pra escolher "Anthropic" sem base-URL e a
 * chave acabava sendo enviada pra api.openai.com.
 *
 * `transport` decide o caminho no runtime:
 *   - 'anthropic'    → SDK da Anthropic (Messages API)
 *   - 'openai-compat'→ SDK da OpenAI apontando pra `defaultBaseUrl`
 */
export type AiTransport = 'anthropic' | 'openai-compat';

export interface CatalogModel {
  /** ID exato que o provider espera. */
  modelId: string;
  label: string;
  hint?: string;
}

export interface CatalogProvider {
  id: string;
  label: string;
  transport: AiTransport;
  /** null = o usuário informa (só no "personalizado"). */
  defaultBaseUrl: string | null;
  /** true = a tela pede nome + base-URL, e o modelo é digitado à mão. */
  requiresManualSetup: boolean;
  keyHint: string;
  models: CatalogModel[];
}

export const AI_MODEL_CATALOG: CatalogProvider[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    transport: 'anthropic',
    defaultBaseUrl: null, // o SDK da Anthropic já aponta pro endpoint certo
    requiresManualSetup: false,
    keyHint: 'Pegue em console.anthropic.com → API Keys (começa com sk-ant-)',
    models: [
      { modelId: 'claude-fable-5', label: 'Claude Fable 5', hint: 'Mais recente' },
      { modelId: 'claude-opus-4-8', label: 'Claude Opus 4.8', hint: 'Mais capaz' },
      { modelId: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', hint: 'Equilibrado' },
      { modelId: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', hint: 'Mais rápido e barato' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    transport: 'openai-compat',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresManualSetup: false,
    keyHint: 'Pegue em platform.openai.com → API Keys (começa com sk-)',
    models: [
      { modelId: 'gpt-4.1', label: 'GPT-4.1' },
      { modelId: 'gpt-4.1-mini', label: 'GPT-4.1 mini', hint: 'Mais barato' },
      { modelId: 'gpt-4o', label: 'GPT-4o' },
      { modelId: 'gpt-4o-mini', label: 'GPT-4o mini', hint: 'Mais barato' },
    ],
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    transport: 'openai-compat',
    // A Google expõe um endpoint compatível com a SDK da OpenAI.
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    requiresManualSetup: false,
    keyHint: 'Pegue em aistudio.google.com → API Keys',
    models: [
      { modelId: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { modelId: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Mais rápido' },
      { modelId: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
  {
    id: 'custom',
    label: 'Personalizado (formato OpenAI)',
    transport: 'openai-compat',
    defaultBaseUrl: null,
    requiresManualSetup: true,
    keyHint: 'A chave do serviço que você vai conectar',
    // Sem lista: o usuário informa nome, base-URL e o ID do modelo. Cobre
    // DeepSeek, OpenRouter, Groq, Together, Ollama, proxies internos — a maior
    // parte do mercado fala o formato da OpenAI.
    models: [],
  },
  {
    id: 'custom-anthropic',
    label: 'Personalizado (formato Anthropic)',
    transport: 'anthropic',
    defaultBaseUrl: null,
    requiresManualSetup: true,
    keyHint: 'A chave do serviço que você vai conectar',
    // Para gateways/proxies que expõem a Messages API da Anthropic em vez do
    // formato da OpenAI (ex.: Bedrock-compat, proxies corporativos de Claude).
    models: [],
  },
];

/**
 * Providers que já foram oferecidos e saíram do catálogo. Registros antigos
 * continuam no banco e PRECISAM seguir funcionando — sem isso, tirar um item da
 * lista derrubaria a IA de quem já o tinha configurado.
 */
const LEGACY_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
};

export function findCatalogProvider(providerId: string): CatalogProvider | undefined {
  return AI_MODEL_CATALOG.find((p) => p.id === providerId);
}

/**
 * Base-URL que o runtime deve usar: o que a org salvou VENCE, e o default do
 * catálogo é só o fallback de quem não informou nada.
 *
 * Essa ordem importa: existe config em produção com `provider: 'openai'` e
 * `baseUrl: 'https://api.deepseek.com'` (um endpoint compatível apontado à mão),
 * que funciona. Se o default do catálogo tivesse prioridade, ela passaria a ir
 * pra api.openai.com e quebraria.
 *
 * O bug da chave Anthropic vazar pro endpoint errado NÃO se resolve aqui — se
 * resolve no `transport`, que escolhe o SDK certo.
 */
export function resolveBaseUrl(
  providerId: string,
  savedBaseUrl: string | null,
): string | null {
  const saved = savedBaseUrl?.trim();
  if (saved) return saved;
  return (
    findCatalogProvider(providerId)?.defaultBaseUrl ??
    LEGACY_BASE_URLS[providerId] ??
    null
  );
}

export function resolveTransport(providerId: string): AiTransport {
  return findCatalogProvider(providerId)?.transport ?? 'openai-compat';
}

/**
 * Provider que saiu do catálogo mas ainda resolve. `assertUsable` aceita esses
 * registros na EDIÇÃO (senão o cliente ficaria impedido de mexer no que já
 * tem), mas eles não aparecem como opção de criação.
 */
export function isLegacyProvider(providerId: string): boolean {
  return providerId in LEGACY_BASE_URLS;
}
