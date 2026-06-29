import { agentCanSeeConversation } from './conversation-visibility.util';

describe('agentCanSeeConversation (visibilidade por setor/atribuição)', () => {
  const me = 'user-1';

  it('vê conversa atribuída a ele', () => {
    expect(
      agentCanSeeConversation(
        { assignedToId: me, departmentId: 'dep-vendas' },
        me,
        [],
      ),
    ).toBe(true);
  });

  it('NÃO vê conversa atribuída a outro atendente', () => {
    expect(
      agentCanSeeConversation(
        { assignedToId: 'outro', departmentId: 'dep-meu' },
        me,
        ['dep-meu'],
      ),
    ).toBe(false);
  });

  it('vê fila sem dono do seu setor', () => {
    expect(
      agentCanSeeConversation(
        { assignedToId: null, departmentId: 'dep-meu' },
        me,
        ['dep-meu', 'dep-outro'],
      ),
    ).toBe(true);
  });

  it('NÃO vê fila sem dono de setor que não é dele', () => {
    expect(
      agentCanSeeConversation(
        { assignedToId: null, departmentId: 'dep-financeiro' },
        me,
        ['dep-atendimento'],
      ),
    ).toBe(false);
  });

  it('vê conversa sem dono e sem setor (rede de segurança)', () => {
    expect(
      agentCanSeeConversation(
        { assignedToId: null, departmentId: null },
        me,
        [],
      ),
    ).toBe(true);
  });

  it('atendente sem setor só vê as próprias e as sem setor', () => {
    expect(
      agentCanSeeConversation(
        { assignedToId: null, departmentId: 'dep-x' },
        me,
        [],
      ),
    ).toBe(false);
  });
});
