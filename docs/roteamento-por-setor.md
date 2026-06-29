# Roteamento por Setor (Departamentos)

Como as conversas são distribuídas entre os setores humanos (Atendimento,
Vendas, Financeiro, etc.) e como cada atendente enxerga só a sua fila.

## Conceitos

- **Setor = `Department`** (`prisma/schema.prisma`). Tem `name`, `description`,
  `isDefault` e os membros via `DepartmentAgent` (N:N com `UserOrganization`).
  Um atendente pode pertencer a vários setores.
- **Conversa** carrega `departmentId` (setor) e `assignedToId` (dono). Sem dono
  (`assignedToId = null`) = está na **fila** do setor.

## Fluxo de uma mensagem nova

1. Chega no inbox e a **IA orquestradora** atende primeiro (se ligada).
2. Quando precisa de humano, a IA usa a tool **`routeToDepartment`**
   (`ai-agents/tools/builtin/route-to-department.tool.ts`): escolhe o setor pela
   necessidade do cliente, **pausa a IA** (`aiEnabled=false`, `activeAgentId=null`)
   e põe a conversa na fila daquele setor (`status=PENDING`, sem dono).
3. `transferToHuman` (sem setor explícito) cai na fila do **setor padrão**.
4. **IA desligada** (org/canal/conversa) → a mensagem cai direto na fila do
   setor padrão (`inbound-message.processor.ts → ensureRoutedToDefaultSector`,
   com `updateMany` condicional pra não sobrescrever ação de humano).

## Setor padrão e a trava

- Marque um setor como **padrão** (estrela) em **Configurações → Setores**.
  É pra onde caem conversas sem setor e quando a IA está off.
- Toggle por empresa **"Enviar tudo pro setor padrão"**
  (`Organization.routeAllToDefaultSector`): quando **ligado**, o orquestrador
  joga tudo no padrão (não distribui); **desligado**, ele escolhe o setor e usa
  o padrão como fallback.

## Visibilidade (fila por setor)

Regra única em `conversations/conversation-visibility.util.ts`
(`agentCanSeeConversation`), aplicada na lista do inbox, ao abrir a conversa,
ao ler mensagens e nas ações:

- **AGENT** vê: conversas atribuídas a ele **OU** sem dono do(s) seu(s)
  setor(es) **OU** sem setor (rede de segurança até serem roteadas).
- **OWNER/ADMIN** veem tudo.

Quando alguém responde uma conversa sem dono, ela vira dele (auto-assign).

## Transferência entre setores

- Endpoint `POST /conversations/:id/transfer-department` (qualquer atendente).
- Ao transferir: zera o dono e volta pra fila `PENDING` do destino → os
  atendentes daquele setor passam a vê-la até alguém pegar.
- Emite `CONVERSATION_STATUS_CHANGED` (automações reagem) e é transacional
  (update + audit juntos).

## UI

- **Configurações → Setores** (OWNER/ADMIN): CRUD de setores, marcar padrão,
  alocar atendentes, e o toggle da trava.
- **Inbox**: botão **"Setor"** no cabeçalho mostra o setor atual e transfere.
  Fixar agente de IA é restrito a OWNER/ADMIN.

## Arquivos-chave

| Item | Caminho |
|------|---------|
| Modelo Department/DepartmentAgent | `axchat-api/prisma/schema.prisma` |
| Predicado de visibilidade | `axchat-api/.../conversations/conversation-visibility.util.ts` |
| Filtro do inbox | `axchat-api/.../conversations/conversations.repository.ts` |
| Transferência | `axchat-api/.../conversations/conversations.service.ts` (`transferToDepartment`) |
| Tool de IA | `axchat-api/.../ai-agents/tools/builtin/route-to-department.tool.ts` |
| IA-off → padrão | `axchat-api/.../messaging/pipeline/inbound-message.processor.ts` |
| Tela de setores | `axchat-web/.../app/(dashboard)/settings/sectors/page.tsx` |
| Transferir no inbox | `axchat-web/.../inbox/components/transfer-department-popover.tsx` |
