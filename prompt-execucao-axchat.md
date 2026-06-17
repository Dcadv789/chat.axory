# Prompt de Execução — AxChat em produção (2 dias)

> Cole este documento inteiro no Claude Code / Cursor. Execute por FASE,
> não pule fases. Cada fase tem um checkpoint — confirme que passou antes
> de avançar pra próxima.

---

## CONTEXTO PARA A IA

Tenho 3 repositórios que formam um sistema único de atendimento omnichannel
com IA (NestJS + Prisma + PostgreSQL + Redis + BullMQ + Next.js). O código
foi adquirido de terceiros com o nome "chat-bullq" / "Bravy" — vamos
**rebatizar o produto inteiro para "AxChat"** (produto irmão do Axdeal,
dentro da Axory Capital Group).

- chat-bullq-api → vira o backend do AxChat
- chat-bullq-web → vira o frontend do AxChat
- chat-bullq-mcp → MCP server read-only, baixa prioridade agora

Já tenho um VPS com Coolify rodando o Axdeal (ERP), com PostgreSQL,
Redis e MinIO já em containers próprios. **Não vou criar bancos/serviços
novos de infra — vou reusar o Postgres do Axdeal**, criando apenas um
banco lógico separado dentro dele:

- Nome do banco: `axchat_db` (já criado por mim manualmente)
- Container do Postgres: `do8sok00k84gswgggccogoko` (postgres:17-alpine)
- Vamos conectar o container da API do AxChat nessa MESMA rede Docker
  do Postgres do Axdeal, sem expor a porta do Postgres pra fora.

Objetivo dos próximos 2 dias: **não é deixar 100% polido, é deixar
funcionando de ponta a ponta** com WhatsApp Oficial (Meta Cloud API) +
DeepSeek como LLM, rodando no VPS de produção via Coolify, sob o nome
AxChat.

NÃO se preocupe ainda com: e-mail, Telegram, super admin (já fiz),
dashboard de métricas pro cliente final, RAG, automações internas,
limpeza completa de branding em todo canto (mas troque o essencial —
ver Fase 1.5). Isso é trabalho de depois.

---

## FASE 0 — Diagnóstico (antes de qualquer mudança)

Antes de tocar em qualquer arquivo, faça isso:

1. Liste o conteúdo de `.env.example` dos 3 repos e me diga quais
   variáveis são obrigatórias para subir cada serviço.
2. Verifique se existe algum `Dockerfile` em cada repo. Se não existir,
   crie um Dockerfile de produção (multi-stage build) para cada um.
3. Verifique a versão do Node exigida em cada `package.json` (engines).
4. Rode `npx prisma validate` no chat-bullq-api e me reporte se o schema
   está válido.
5. Me dê um resumo de quais variáveis de ambiente relacionadas a
   WhatsApp/Meta e a LLM existem no `.env.example` do chat-bullq-api.

**CHECKPOINT 0:** Não avance até eu confirmar que vi esse diagnóstico e
aprovar.

---

## FASE 1 — Monorepo e Docker Compose (alvo: 2-3 horas)

1. Una os 3 repositórios em um único repositório Git com esta estrutura:
   ```
   /axchat
     /api      (conteúdo do chat-bullq-api)
     /web      (conteúdo do chat-bullq-web)
     /mcp      (conteúdo do chat-bullq-mcp)
     docker-compose.yml
     .env.example (unificado, com comentários de qual serviço usa qual var)
   ```

2. Crie um `docker-compose.yml` com APENAS os serviços de aplicação —
   **NÃO crie containers novos de Postgres, Redis ou MinIO**. Vamos
   reusar a infraestrutura que já existe no VPS (a do Axdeal):
   - `api` (build do Dockerfile em /api)
   - `web` (build do Dockerfile em /web)

   O Postgres já existe no container `do8sok00k84gswgggccogoko`
   (postgres:17-alpine) e já tem um banco lógico criado chamado
   `axchat_db` — a API do AxChat vai se conectar nele via `DATABASE_URL`
   apontando para esse container, NÃO para um serviço `postgres` local
   no compose.

   O MinIO e o Redis também já existem no VPS (containers
   `minio-gdp4cunqtz295eo9imr885v2` e `zhuzykenv2jheg9kqyyzx018`) — me
   pergunte se precisa criar bucket/database lógico separado para o
   AxChat antes de assumir, mas NÃO crie containers novos para eles.

3. Para os containers `api` e `web` conseguirem resolver o nome do
   container Postgres do Axdeal, eles precisam estar na MESMA rede
   Docker. Use uma rede externa no compose:
   ```yaml
   networks:
     axdeal-shared:
       external: true
       name: NOME_DA_REDE_REAL_AQUI  # vou te passar o nome exato
   ```
   Pergunte-me o nome exato da rede antes de finalizar — eu vou rodar
   `docker inspect` no container do Postgres e te passar o valor real.

4. Garanta que o `docker-compose.yml` tenha healthcheck na API
   (endpoint `/health` se existir, ou crie um básico) para o Coolify
   saber quando o serviço está de pé.

**CHECKPOINT 1:** Me mostre o docker-compose.yml completo antes de eu
subir no VPS. Vou revisar nome de rede e variáveis manualmente.

---

## FASE 1.5 — Rebranding para AxChat (alvo: 1-2 horas)

O produto vai se chamar **AxChat** (não mais "Chat BullQ" ou "Bravy").
Faça uma busca em todo o codebase (api + web) por essas strings e troque
pelo nome novo onde for visível ao usuário final ou relevante para
identidade do produto:

- Busque por: `bullq`, `BullQ`, `Bravy`, `bravy` (case insensitive) em:
  - Nomes de variáveis de ambiente relacionadas à marca (não toque em
    nomes de pacote npm/imports que seriam trabalho grande sem ganho
    real agora)
  - Título da página (`<title>`), metadados, favicon se houver
  - Textos de UI visíveis (header, login, e-mails de sistema, nome do
    app em notificações push)
  - `package.json` → campo `name` dos projetos (pode renomear para
    `axchat-api` e `axchat-web`)
  - Arquivos de config tipo `app.config.ts` se houver nome de app
    hardcoded

NÃO se preocupe em renomear:
  - Nomes internos de variáveis/funções no código (refactor sem ganho
    visual, custa tempo que não temos)
  - Comentários de código mencionando o histórico do projeto

Me dê um resumo de quantos arquivos foram alterados e quais strings
mudaram, para eu revisar antes de seguir.

**CHECKPOINT 1.5:** Confirme visualmente que o frontend mostra "AxChat"
no título da página e no header antes de seguir para a Fase 2.

---

## FASE 2 — Variáveis de ambiente de produção (alvo: 1 hora)

1. Crie um `.env.production` (NÃO commitado, apenas local/Coolify) com:
   - `DATABASE_URL` apontando pro Postgres do compose
   - `REDIS_URL` apontando pro Redis do compose
   - Credenciais do MinIO
   - `JWT_SECRET` gerado novo (não usar o que vier de exemplo)
   - Variável(is) de LLM: preciso configurar **DeepSeek** como provider
     principal. Verifique no `llm.service.ts` e `llm.types.ts` se o
     DeepSeek já está suportado nativamente ou se precisa de adapter
     novo (DeepSeek é compatível com a API da OpenAI, então
     provavelmente só precisa apontar `baseURL` diferente com a lib
     `openai` já presente no projeto).
   - Variáveis do WhatsApp Oficial (Meta): `WHATSAPP_TOKEN`,
     `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
     `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — confirme os nomes exatos que o
     `whatsapp-official.module.ts` espera.

2. Me diga exatamente quais variáveis ainda preciso preencher com
   valores reais (deixe placeholder claro tipo `PREENCHER_AQUI`).

**CHECKPOINT 2:** Vou preencher os valores reais manualmente (tokens da
Meta, chave DeepSeek). Não siga para Fase 3 sem eu confirmar que preenchi.

---

## FASE 3 — Configurar DeepSeek como provider (alvo: 1-2 horas)

1. No `llm.service.ts`, adicione suporte ao DeepSeek caso não exista:
   - DeepSeek usa endpoint compatível com OpenAI SDK
   - Base URL: `https://api.deepseek.com`
   - Modelo: `deepseek-chat` (ou `deepseek-reasoner` se eu quiser raciocínio)
   - A chave de API já está no `.env.production` que configurei na Fase 2

2. IMPORTANTE — multimodalidade: DeepSeek não lê imagem nem áudio bem.
   Configure um fallback: se a mensagem recebida for do tipo IMAGE ou
   AUDIO, o sistema deve rotear para outro provider só nesse caso
   específico. Se eu não tiver chave de Claude/OpenAI configurada ainda,
   apenas:
   - Para ÁUDIO: deixe um stub claro logando "transcrição não configurada"
     e me avise no chat que preciso de uma chave de Whisper/OpenAI depois.
   - Para IMAGEM: mesma coisa, stub claro avisando que preciso de chave
     de Vision depois.
   NÃO quebre o fluxo de texto por falta dessas chaves — texto é o
   prioritário agora.

3. Rode os testes de `evals` que já existem no projeto
   (`src/modules/ai-agents/evals/`) contra o DeepSeek configurado e me
   reporte os resultados.

**CHECKPOINT 3:** Me confirme que o agente responde em texto puro
usando DeepSeek antes de seguir.

---

## FASE 4 — Conectar WhatsApp Oficial (Meta) (alvo: 2-3 horas)

Esta é a fase mais crítica. Vou ter conta Meta Business configurada e
vou te passar o token, phone_number_id e webhook verify token.

1. Verifique o `whatsapp-official.module.ts`,
   `whatsapp-official.inbound-adapter.ts` e
   `whatsapp-official.outbound-adapter.ts` — me explique resumidamente
   o fluxo de como uma mensagem entra e sai, para eu entender o que
   testar.

2. Confirme qual é a URL de webhook que preciso cadastrar no Meta
   Business Manager (formato `https://meu-dominio/webhooks/whatsapp` ou
   similar — me dê a rota exata do `webhook-gateway.controller.ts`).

3. Depois que eu cadastrar o webhook no Meta e confirmar a verificação,
   vamos testar:
   - Enviar mensagem de teste do meu celular para o número configurado
   - Confirmar que aparece no banco (tabela `messages` e `conversations`)
   - Confirmar que aparece em tempo real no frontend via Socket.io
   - Confirmar que o agente de IA responde automaticamente

4. Se travar em algum ponto, me dê o log exato do erro (não resuma) para
   eu decidir o que fazer.

**CHECKPOINT 4:** Esse é o marco mais importante dos 2 dias — mensagem
real do WhatsApp chegando e IA respondendo. Não avance pra Fase 5 sem
isso funcionar.

---

## FASE 5 — Deploy no Coolify (alvo: 2-3 horas, pode ser feito em paralelo com Fase 4 se eu já tiver testado local antes)

1. Me dê o passo a passo de como configurar este projeto como uma nova
   aplicação no Coolify a partir do monorepo da Fase 1 — preciso saber
   exatamente quais campos preencher (Dockerfile path por serviço,
   variáveis de ambiente, domínio).

2. Confirme que o Traefik vai rotear corretamente sem conflitar com o
   Axdeal que já está rodando.

3. Depois do deploy, valide novamente o fluxo completo (Fase 4) mas
   agora apontando pro domínio de produção real, não local.

**CHECKPOINT 5:** Sistema rodando no domínio de produção, recebendo
WhatsApp real, IA respondendo via DeepSeek.

---

## REGRAS GERAIS PARA TODA A EXECUÇÃO

- Não invente nomes de variáveis de ambiente — leia o código-fonte real
  antes de assumir o nome de uma env var.
- Se algo não está implementado e eu pedi pra funcionar, me avise
  explicitamente em vez de simular/mockar silenciosamente.
- Priorize "funcionando simples" sobre "bonito e completo" — estética e
  branding ficam para depois dos 2 dias.
- Sempre que travar mais de 15 minutos em um erro, pare e me peça o log
  completo em vez de tentar 5 abordagens diferentes sem me avisar.
- Não toque em nada relacionado ao meu projeto Axdeal/Axory existente no
  mesmo VPS — isolamento total de containers, redes e variáveis.

---

## O QUE FICA EXPLICITAMENTE FORA DESSES 2 DIAS

E-mail, Telegram, RAG, automações internas, super admin (já pronto),
dashboard de métricas do tenant, limpeza de branding/Bravy, leitura de
imagem e áudio (só o stub avisando), multi-tenant real com mais de uma
org ativa, billing.
