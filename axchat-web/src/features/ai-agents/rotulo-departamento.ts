import type { AgentSector } from './services/ai-agents.service';

/** Como cada frente se chama por extenso, pra comparar com o departamento. */
const NOME_DA_FRENTE: Record<AgentSector, string[]> = {
  ATENDIMENTO: ['atendimento', 'suporte ao cliente'],
  MARKETING: ['marketing'],
  OPERACAO: ['operacao', 'operacoes'],
  PESSOAL: ['pessoal', 'assistente pessoal'],
};

// Acentos combinantes que o NFD separa da letra. Escrito por escape de
// propósito: a classe com os caracteres literais fica invisível no editor e
// se perde em qualquer arquivo salvo fora de UTF-8.
const ACENTOS = /[\u0300-\u036f]/g;

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(ACENTOS, '');
}

/**
 * O departamento a MOSTRAR, dado que a tela já diz em qual frente você está.
 *
 * Dentro de Marketing, todo agente carregava um selo escrito "MARKETING" —
 * embaixo do nome, no cartão, no cabeçalho do grupo. Repetir o nome da frente
 * em cada linha não informa nada: quem está na tela de Marketing já sabe que é
 * marketing. Pior, ocupa o lugar onde deveria estar a informação útil, que é o
 * departamento de verdade (Conteúdo, Anúncios, Social).
 *
 * Devolve `null` quando o departamento é só o eco da frente — aí quem chama
 * decide se esconde o selo ou mostra outra coisa no lugar.
 */
export function departamentoVisivel(
  department: string | null | undefined,
  frente: AgentSector | null | undefined,
): string | null {
  const dep = department?.trim();
  if (!dep) return null;
  if (!frente) return dep;
  return NOME_DA_FRENTE[frente]?.includes(normalizar(dep)) ? null : dep;
}

/**
 * Verdadeiro quando TODOS os agentes repetem o nome da frente como
 * departamento — ou seja, agrupar por departamento não separa nada e a coluna
 * inteira vira ruído.
 */
export function departamentoNaoSepara(
  departamentos: Array<string | null | undefined>,
  frente: AgentSector | null | undefined,
): boolean {
  return departamentos.every((d) => departamentoVisivel(d, frente) === null);
}
