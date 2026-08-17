/**
 * Avatar do agente sem depender de arquivo de imagem.
 *
 * O campo `avatarUrl` já existia no banco e estava sempre nulo, então todo
 * agente aparecia com o mesmo ícone genérico — num organograma de 12 cartões
 * iguais, o olho não acha ninguém. Aqui ele passa a aceitar três formatos:
 *
 *   `emoji:🎯`   — escolhido na configuração, na lista abaixo
 *   `https://…`  — imagem de verdade, se um dia alguém subir
 *   vazio        — iniciais do nome, com cor derivada do próprio nome
 *
 * As iniciais coloridas são o padrão de propósito: não exigem escolha nenhuma
 * e já diferenciam os agentes entre si no primeiro carregamento.
 */

/** Carinhas prontas pra escolher na configuração. */
export const AVATARES_PRONTOS = [
  '🎯', '📊', '✍️', '📣', '💡', '🧠',
  '🤝', '💼', '⚖️', '🧾', '🛠️', '🚀',
  '🔍', '📈', '🎨', '🤖',
] as const;

/** Paleta das iniciais. Tons médios: legíveis com texto branco em cima. */
const CORES = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626',
  '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
  '#4f46e5', '#be123c', '#0d9488', '#9333ea',
];

/**
 * Cor estável a partir do nome. Precisa ser determinística: se sorteasse, o
 * agente trocaria de cor a cada render e a lista piscaria.
 */
function corDoNome(nome: string): string {
  let soma = 0;
  for (let i = 0; i < nome.length; i++) soma = (soma * 31 + nome.charCodeAt(i)) >>> 0;
  return CORES[soma % CORES.length];
}

/** Até duas letras: "Augusto Mendes" → AM, "Magnus" → MA. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export type Avatar =
  | { tipo: 'emoji'; emoji: string }
  | { tipo: 'imagem'; url: string }
  | { tipo: 'iniciais'; texto: string; cor: string };

export function resolverAvatar(
  nome: string,
  avatarUrl: string | null | undefined,
): Avatar {
  const bruto = avatarUrl?.trim();
  if (bruto?.startsWith('emoji:')) {
    const emoji = bruto.slice('emoji:'.length).trim();
    if (emoji) return { tipo: 'emoji', emoji };
  }
  if (bruto?.startsWith('http')) return { tipo: 'imagem', url: bruto };
  return { tipo: 'iniciais', texto: iniciais(nome), cor: corDoNome(nome) };
}

/** O papel do agente em português, pra estampar no cartão. */
export function papelDoAgente(kind: string): string {
  return kind === 'ORCHESTRATOR' ? 'Orquestrador' : 'Especialista';
}
