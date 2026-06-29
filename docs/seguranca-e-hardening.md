# Segurança & Hardening — changelog e modelo

Registro das correções de segurança/robustez/performance feitas em cima da
auditoria, e o que ainda falta. Serve de referência pra revisão e onboarding.

## Modelo de isolamento (multi-tenant + setor)

- **Org**: toda rota passa por `JwtAuthGuard + OrgGuard + RolesGuard`; queries
  filtram por `organizationId`. IDs vindos do cliente (department, assignee,
  pending-action, skill) são validados contra a org atual antes de usar.
- **Setor/atribuição**: `agentCanSeeConversation` (predicado único) escopa o
  que um AGENT vê/atua — lista, abrir conversa, ler mensagens, mídia,
  transcrição, revogar, e ações de controle. OWNER/ADMIN veem tudo.

## Changelog

### Bloco 1 — Segurança (crítico)
- Segredos JWT removidos do `.env.coolify.example` (→ placeholders).
- **IDOR fechado** no controller de `pending-actions` (OrgGuard + RBAC + escopo
  por org em list/get/approve/reject).
- Vazamento entre setores fechado: visibilidade aplicada também em
  `messages.findByConversation` e `conversations.findOne`.
- Executor de pending-action resolve skill **escopada por org** (evita rodar
  tool/credencial de outra org).
- `conversations.update` valida `departmentId`/`assignedToId` por org.

### Follow-ups
- Ações de controle (`toggleAi`, `engageAi`, `setActiveAgent`, `close`,
  `reopen`, `syncMessages`, `markAsRead/Unread`) escopadas por setor (AGENT).
- `getMedia`/`transcribe`/`revoke` checam acesso por setor antes de agir.

### Bloco 2 — Robustez
- `transferToHuman` pausa a IA na hora + dedup de pending action; rejeitar
  reativa a IA.
- Clients LLM (Anthropic/OpenAI-compat) com `timeout` 60s + `maxRetries`.
- Front: **single-flight** no refresh de token (`lib/auth-refresh.ts`) — fim do
  logout aleatório por corrida de rotação.
- Índice `idx_conv_org_department` (regressão da fila por setor).
- Dashboard respeita `deletedAt: null` (métricas não inflam com itens deletados).
- Transferência de setor atômica (`$transaction`) e `ensureRoutedToDefaultSector`
  com `updateMany` condicional (race-safe).

### Bloco 3 — Performance
- Índices de cobertura: `(org, isArchived, lastMessageAt desc)`,
  `(org, createdAt)`, `messages(conversationId, direction, createdAt)`.
- `attachUnreadCounts`: N+1 (um count por conversa) → **uma query** só.
- Inbox: detalhe da conversa atualiza por realtime (`conversation:updated`);
  poll reduzido 5s → 10s (rede de segurança).

### Bloco 4 — UX / infra / IA
- IA: custo do classificador contabilizado no run; outbox
  `CONVERSATION_STATUS_CHANGED` na transferência (humana e via IA);
  `shouldHandle` recua quando há humano atribuído (takeover).
- Infra: webhook Instagram **exige assinatura** (paridade com WhatsApp);
  rate-limit em `/auth/login` e `/register` (`login-throttle.guard.ts`);
  fail-fast de env no boot (`ConfigModule.validate`); **readiness probe**
  `GET /health/ready` (checa banco); `defaultJobOptions` global do BullMQ
  (caps de retenção); resiliência Redis (`common/redis.util.ts`,
  `retryStrategy`+`connectTimeout` nos 5 clients); varredura periódica de runs
  travados (`agent-runner` sweep a cada 5min); `.env.example` completo;
  `docker-compose.yml` duplicado removido.
- Front: estados de erro com "Tentar novamente" (inbox, chat, setores);
  fixar agente de IA restrito a OWNER/ADMIN.
- Perf: `getMessagesFlow` agrega no banco (antes puxava todas as mensagens).

### Reforços (pós-Bloco 4)
- **Testes**: suíte criada (jest+ts-jest); 20 testes cobrindo visibilidade por
  setor, guards de texto (meta-talk/URL) e o rate-limit de login.
- **Login-throttle no Redis** (`login-throttle.guard.ts`): limite compartilhado
  entre réplicas, com **fail-open** (Redis fora → não bloqueia login).
- **Cap de IA no comentário do Instagram**: `agentRouter.isWithinAiBudget`
  reusa o check de cota; o caminho que pula `shouldHandle` agora respeita o cap.
- **Logs**: request-id (correlation) no access log + header `x-request-id`;
  querystring removida do log (tirava PII tipo telefone da URL).

## Pendências (precisam de ambiente rodando ou decisão/ops)

**Front (precisa QA visual — não blind-shippar)**
- Chat: "carregar mensagens anteriores" (infinite scroll). Interligado com o
  append em realtime (`setQueryData` no shape de `useQuery`) e o anchoring de
  scroll — exige rodar a app pra validar.
- Virtualização da lista do inbox (precisa `@tanstack/react-virtual` + QA).

**Perf (risco de bug sutil sem rodar)**
- Resto da agregação do dashboard (sparklines, agent-performance, peak-hours)
  no banco com `date_trunc` — validar números com a app rodando.

**Ops / só você**
- **Rotacionar `JWT_SECRET`/`JWT_REFRESH_SECRET` em produção** (antigos no
  histórico do git).
- Índice GIN trigram da busca textual (rodar `CONCURRENTLY` no console do banco
  — não roda via Prisma):
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_msg_content_text_trgm
    ON messages USING gin ((content->>'text') gin_trgm_ops);
  ```

**Outros (menores)**
- Tokens em `localStorage` → refresh em cookie httpOnly (mudança de arquitetura).
- Correlation-id **completo** entre todos os logs de serviço (precisa
  AsyncLocalStorage). Hoje o request-id está no access log + header de resposta.
- Cota de IA no **auto-chain** de delegação (bounded por `MAX_CHAIN_DEPTH=3`).
- Suíte de testes: expandir pra FSM de conversa e idempotência inbound
  (precisam de mocks de Prisma/Redis — base de testes já existe).

## Mudanças de comportamento a observar
- Canal **Instagram sem `appSecret`** para de aceitar webhook (configure o
  appSecret do app Meta no canal).
- App **não sobe** sem `DATABASE_URL`/`JWT_SECRET`/`JWT_REFRESH_SECRET`.
- `/auth/login` e `/register` retornam **429** após 10 tentativas/min por IP+email.
