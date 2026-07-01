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
  querystring removida do log (tirava PII tipo telefone da URL). Depois
  estendido pra **todos os logs de serviço** via AsyncLocalStorage + AppLogger
  (ver Pendências → Outros).

## Pendências (precisam de ambiente rodando ou decisão/ops)

**Front (precisa QA visual — não blind-shippar)**
- ✅ Chat "carregar mensagens anteriores" — FEITO via prepend (mantém o
  `useQuery`/realtime intactos, sem migrar pra useInfiniteQuery), com
  preservação de scroll. Validado por `next build`; falta só o "feeling" visual.
- Virtualização da lista do inbox (precisa `@tanstack/react-virtual` + QA visual
  de seleção/menu/separadores) — **decidido NÃO fazer** por ora: ganho marginal
  na escala atual (30/página + scroll infinito já ajudam) vs. risco de regressão
  no componente central do time, sem ambiente de teste. Retomar se a lista
  crescer muito (centenas de itens carregados).

**Perf (risco de bug sutil sem rodar)**
- ✅ `getMessagesFlow` e `getVolumeByDay` — agregados no banco.
- ✅ Resto da agregação do dashboard — TODOS migrados pra `$queryRaw` com
  `GROUP BY`/`AVG`/`COUNT FILTER` no banco: `getPeakHours`, `getKpiSparklines`,
  `getAgentPerformance` (join + médias), `getVolumeFlow`, `getBotPerformance`,
  `getAvgFirstResponseTime`, `getAvgResolutionTime`, `getSlaCompliance`.
  Semântica preservada (mesma bucketização UTC e arredondamentos). **Validar os
  números na app rodando** — a lógica é equivalente mas não foi rodada contra o
  banco.

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
- ✅ **Refresh token em cookie httpOnly** — o token de longa duração saiu do
  `localStorage` (protege contra roubo por XSS). O access token continua no
  header `Authorization` (JwtStrategy inalterado — risco baixo). Design:
  - `auth-cookie.util.ts`: cookie `refresh_token` httpOnly, `path=/api/v1/auth`,
    prod `SameSite=None; Secure` / dev `Lax`. `res.cookie`/leitura manual do
    header (sem cookie-parser).
  - `/auth/login|register` setam o cookie; `/auth/refresh` lê **body OU cookie**
    com **precedência do body**; `/auth/logout` limpa o cookie.
  - **Impersonação preservada**: o super admin carrega o refresh impersonado no
    body (localStorage) → precedência do body usa ele e o refresh **não regrava
    o cookie** quando veio do body → o cookie do admin fica intacto pra quando
    ele sair da impersonação. Web: `withCredentials`, login/register não guardam
    mais o refresh, `restoreAdmin` cai no cookie do admin.
  - ⚠️ **Verificar no deploy** (só há produção): login → navegar → deixar o
    access expirar (~15min) e confirmar que renova sozinho; testar impersonar e
    **voltar**; testar logout. Reverter é 1 commit se algo falhar.
- ✅ Correlation-id **completo** entre TODOS os logs de serviço — via
  `AsyncLocalStorage` (`common/context/request-context.ts`) + `AppLogger`
  (`common/logger/app-logger.ts`), ligado no `main.ts` com um middleware que
  abre o store por request. Agora todo `this.logger.log(...)` em qualquer
  service sai com `[<requestId>]` (o mesmo do header `x-request-id`).
- Cota de IA no **auto-chain** de delegação (bounded por `MAX_CHAIN_DEPTH=3`).
- ✅ Suíte de testes expandida: **FSM de conversa**
  (`conversation-fsm.service.spec.ts` — 25 casos: transições válidas/inválidas,
  closedAt/reopen, assign com no-op idempotente) e **idempotência do outbox**
  (`outbox.service.spec.ts` — 8 casos: dedupKey por trigger, P2002 silenciado,
  hard-fails). Total: 53 testes em 5 suítes.

## Mudanças de comportamento a observar
- Canal **Instagram sem `appSecret`** para de aceitar webhook (configure o
  appSecret do app Meta no canal).
- App **não sobe** sem `DATABASE_URL`/`JWT_SECRET`/`JWT_REFRESH_SECRET`.
- `/auth/login` e `/register` retornam **429** após 10 tentativas/min por IP+email.
