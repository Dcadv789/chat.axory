import type { EngineSlot } from './ai-engine-settings.service';

/** Como falamos com o provedor: SDK da Anthropic ou API no formato OpenAI. */
export type TransporteDoMotor = 'anthropic' | 'openai-compat';

export interface MotorDeTexto {
  transporte: TransporteDoMotor;
  baseUrl: string | null;
  apiKey: string | null;
  modelId: string;
  /** O provedor tem visão nativa? Se não, imagem é desviada pro slot Visão. */
  temVisao: boolean;
}

const MODELO_PADRAO = 'deepseek-chat';

/**
 * Decide COMO falar com o motor de texto configurado no Super Admin.
 *
 * Antes o provedor saía do texto do `modelId` do agente: um id começando com
 * "claude" ia pra Anthropic, "gpt" pra OpenAI, "deepseek" pra DeepSeek. O
 * efeito é que o slot `text` do Motor de IA só valia quando o modelo do agente
 * por acaso começava com "deepseek" — configurar o motor não mudava nada pros
 * outros 346 agentes.
 *
 * Agora é o contrário: o slot manda, e o agente segue. Configurou DeepSeek,
 * todos usam DeepSeek; configurou OpenAI, todos usam OpenAI.
 *
 * O transporte sai da BASE URL, não do nome do modelo: a API da OpenAI virou
 * padrão de fato (DeepSeek, Google, Groq, Together e self-hosted falam ela),
 * então só a Anthropic precisa de caminho próprio.
 */
export function resolverMotorDeTexto(slot: EngineSlot): MotorDeTexto {
  const base = (slot.baseUrl ?? '').toLowerCase();
  const modelId = slot.modelId?.trim() || MODELO_PADRAO;

  // Sem base declarada, o nome do modelo é a única pista — e é o caso de quem
  // configura Anthropic, porque lá a base costuma ficar vazia (o SDK sabe o
  // endereço). Fora isso, base vazia significa o default OpenAI-compat.
  const ehAnthropic =
    base.includes('anthropic') ||
    (!base && /^claude/i.test(modelId));

  return {
    transporte: ehAnthropic ? 'anthropic' : 'openai-compat',
    baseUrl: slot.baseUrl,
    apiKey: slot.apiKey,
    modelId,
    // Claude e GPT-4o leem imagem; DeepSeek não. Errar pra "não tem" é seguro:
    // no máximo a imagem dá uma volta pelo slot de Visão, que é justamente o
    // que ele existe pra fazer.
    temVisao: ehAnthropic || /gpt-4|gpt-5|o1|o3|o4|gemini/i.test(modelId),
  };
}
