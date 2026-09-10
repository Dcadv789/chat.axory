import { resolverMotorDeTexto } from './motor-de-texto';

/**
 * A regra que estes testes fixam é a que você configura, todos usam.
 *
 * Antes o provedor saía do nome do modelo salvo em cada agente — um id
 * começando com "claude" ia pra Anthropic, "gpt" pra OpenAI. O slot `text` do
 * Motor de IA só valia quando o modelo do agente por acaso começava com
 * "deepseek", então configurar o motor não mudava nada pros outros 346
 * agentes. Quem mandava era um campo de texto num cadastro.
 */
describe('Motor de texto — o slot manda, o agente segue', () => {
  it('DeepSeek configurado: fala no formato OpenAI, com a chave do slot', () => {
    const m = resolverMotorDeTexto({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'chave-deepseek',
      modelId: 'deepseek-chat',
    });

    expect(m.transporte).toBe('openai-compat');
    expect(m.apiKey).toBe('chave-deepseek');
    expect(m.modelId).toBe('deepseek-chat');
    // DeepSeek não lê imagem — o desvio pro slot de Visão depende disto.
    expect(m.temVisao).toBe(false);
  });

  it('OpenAI configurado: mesmo transporte, outra base', () => {
    const m = resolverMotorDeTexto({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'chave-openai',
      modelId: 'gpt-4o',
    });

    expect(m.transporte).toBe('openai-compat');
    expect(m.temVisao).toBe(true);
  });

  it('Anthropic configurado: SDK próprio, porque não é compatível', () => {
    const m = resolverMotorDeTexto({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'chave-anthropic',
      modelId: 'claude-sonnet-4-6',
    });

    expect(m.transporte).toBe('anthropic');
    expect(m.temVisao).toBe(true);
  });

  it('Anthropic sem base declarada: o nome do modelo é a pista', () => {
    // Quem configura Anthropic costuma deixar a base vazia — o SDK já sabe o
    // endereço. Sem esta regra, cairia em openai-compat e quebraria.
    const m = resolverMotorDeTexto({
      baseUrl: null,
      apiKey: 'chave',
      modelId: 'claude-haiku-4-5',
    });

    expect(m.transporte).toBe('anthropic');
  });

  it('Google pela camada compatível: openai-compat, com visão', () => {
    const m = resolverMotorDeTexto({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'chave-google',
      modelId: 'gemini-2.5-flash',
    });

    expect(m.transporte).toBe('openai-compat');
    expect(m.temVisao).toBe(true);
  });

  it('provedor desconhecido é tratado como compatível — é o padrão de fato', () => {
    const m = resolverMotorDeTexto({
      baseUrl: 'https://meu-servidor-interno/v1',
      apiKey: 'k',
      modelId: 'llama-3',
    });

    expect(m.transporte).toBe('openai-compat');
    // Sem saber se lê imagem, assume que não: no pior caso a imagem dá uma
    // volta pelo slot de Visão, que é exatamente o papel dele.
    expect(m.temVisao).toBe(false);
  });

  it('slot sem modelo cai num padrão em vez de mandar string vazia', () => {
    const m = resolverMotorDeTexto({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'k',
      modelId: null,
    });

    expect(m.modelId).toBe('deepseek-chat');
  });
});
