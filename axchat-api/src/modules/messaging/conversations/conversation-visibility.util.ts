/**
 * Regra de visibilidade por atribuição + setor para o papel AGENT, em forma de
 * predicado puro. É a MESMA lógica do `where` aplicado na lista do inbox
 * (`conversations.repository.findInbox` / `countByStatus`) — manter aqui como
 * fonte única evita drift entre a lista e as checagens ponto-a-ponto
 * (abrir conversa, ler mensagens).
 *
 * Um AGENT enxerga uma conversa quando:
 *   - está atribuída a ele; OU
 *   - está sem dono E (sem setor [rede de segurança] OU de um setor dele).
 *
 * OWNER/ADMIN não passam por aqui (veem tudo).
 */
export function agentCanSeeConversation(
  conv: { assignedToId: string | null; departmentId: string | null },
  userId: string,
  departmentIds: string[],
): boolean {
  if (conv.assignedToId === userId) return true;
  if (conv.assignedToId === null) {
    if (conv.departmentId === null) return true;
    return departmentIds.includes(conv.departmentId);
  }
  return false;
}
