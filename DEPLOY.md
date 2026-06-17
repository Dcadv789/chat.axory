# Deploy do AxChat (Coolify + infra do Axdeal)

Monorepo com tres servicos:

- `api`: backend NestJS (Prisma, PostgreSQL, Redis/BullMQ, Socket.io).
- `web`: frontend Next.js (standalone).
- `mcp`: MCP server read-only (baixa prioridade).

O AxChat **reusa a infraestrutura do Axdeal** no mesmo VPS: PostgreSQL, Redis e MinIO ja existentes. **Nao** criamos containers novos de banco/cache.

---

## 1. Pre-requisitos no VPS

- Banco logico `axchat_db` ja criado dentro do container Postgres do Axdeal (`do8sok00k84gswgggccogoko`, postgres:17-alpine).
- Redis do Axdeal no container `zhuzykenv2jheg9kqyyzx018`.
- MinIO: **nao e necessario agora** — os uploads do AxChat usam disco local (`UPLOADS_DIR`), com volume Docker `api_uploads`. Nenhum bucket precisa ser criado.

### Rede Docker compartilhada

Os containers `api`/`web`/`mcp` precisam estar na MESMA rede Docker do Postgres/Redis para resolver os nomes dos containers. A rede ja foi confirmada via `docker inspect do8sok00k84gswgggccogoko` -> **`coolify`**, e ja esta configurada no `docker-compose.yml`:

```yaml
networks:
  axdeal-shared:
    external: true
    name: coolify
```

---

## 2. Variaveis de ambiente

Copie de [.env.coolify.example](.env.coolify.example) para o painel do Coolify e preencha os campos `PREENCHER_*`:

- `DATABASE_URL`: aponta para `do8sok00k84gswgggccogoko:5432/axchat_db` (usuario/senha do Postgres do Axdeal).
- `REDIS_HOST=zhuzykenv2jheg9kqyyzx018`, `REDIS_PORT`, `REDIS_PASSWORD`.
- `APP_URL`: dominio publico da API (sem `/api/v1`).
- `CORS_ORIGIN`: dominio publico do frontend.
- `NEXT_PUBLIC_API_URL`: dominio publico da API **com** `/api/v1` (embutido no build do `web`).
- `JWT_SECRET` / `JWT_REFRESH_SECRET`: ja vem gerados no exemplo; troque se quiser.
- `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL=https://api.deepseek.com`.
- `ANTHROPIC_API_KEY` (visao de imagem) e `OPENAI_API_KEY` (transcricao de audio/Whisper).
- `AI_DEFAULT_MODEL_ID=deepseek-chat`, `AI_VISION_FALLBACK_MODEL_ID=claude-haiku-4-5`.

As credenciais do WhatsApp **nao** vao aqui — veja a secao 5.

---

## 3. Como o LLM esta configurado

- **Chave DeepSeek pela UI**: a chave de API do DeepSeek e colocada em **Settings > IA** (campo "Chave de API DeepSeek"), salva por organizacao no banco. A env `DEEPSEEK_API_KEY` fica **em aberto** e so e usada como fallback global se a org nao tiver chave propria.
- **Texto**: DeepSeek (`deepseek-chat`) e o provider principal. O roteamento e por prefixo do `modelId` de cada agente.
- **Imagem**: DeepSeek nao tem visao. Quando uma mensagem com imagem chega para um agente DeepSeek, aquela chamada e automaticamente roteada para o modelo Claude de `AI_VISION_FALLBACK_MODEL_ID`. Sem `ANTHROPIC_API_KEY`, a imagem vira um aviso textual (stub) e o fluxo de texto continua.
- **Audio**: transcrito por Whisper (OpenAI) ANTES de chegar ao LLM. Sem `OPENAI_API_KEY`, o agente recebe um texto stub pedindo a mensagem por escrito.
- Agentes ja existentes no banco continuam com o modelo que tiverem; troque para `deepseek-chat` na tela de IA (Settings > IA) ou recrie pelo seed (`AI_DEFAULT_MODEL_ID`).

---

## 4. Primeiro deploy

No Coolify, crie a aplicacao como **Docker Compose** apontando para `docker-compose.yml`.

No primeiro start, o container `api` roda automaticamente:

```sh
npx prisma migrate deploy && node dist/src/main
```

Isso aplica as migrations no `axchat_db`. Depois crie o primeiro usuario:

- pela tela `/register` do frontend, ou
- rodando o seed (cria admin padrao):

```sh
npm run prisma:seed --prefix axchat-api
# admin@bravy.com / Admin@123  -> troque a senha imediatamente
```

Para criar os agentes de IA padrao (ja com `deepseek-chat`):

```sh
npm run prisma:seed:agents --prefix axchat-api
```

### Healthcheck

A API expoe `GET /health` (fora do prefixo `api/v1`). O Coolify/Docker usam essa rota para saber quando o servico esta de pe.

---

## 5. WhatsApp Oficial (Meta)

As credenciais ficam **por canal** no banco (`channel.config`), nao em env.

### Como uma mensagem entra e sai (fluxo)

- **Entrada (inbound)**: Meta -> `POST /api/v1/webhooks/WHATSAPP_OFFICIAL` -> o gateway valida a assinatura HMAC (`x-hub-signature-256` usando `config.appSecret`), descobre o canal pelo `phone_number_id` do payload, normaliza a mensagem, grava em `conversations`/`messages`, emite `message:new` via Socket.io e dispara o agente de IA. Audio e transcrito (Whisper) antes do agente; imagem e roteada pro Claude.
- **Saida (outbound)**: a resposta do agente (ou do atendente) chama o outbound adapter, que posta em `https://graph.facebook.com/{apiVersion}/{phoneNumberId}/messages` usando `config.accessToken`.

### Passo a passo

1. Suba a API em producao e garanta que `https://SEU_DOMINIO_API/health` responde 200.
2. Crie um canal `WHATSAPP_OFFICIAL` (UI: Settings > Canais, ou via API autenticada `POST /api/v1/channels`). Corpo:

```json
{
  "type": "WHATSAPP_OFFICIAL",
  "name": "WhatsApp Principal",
  "config": {
    "accessToken": "TOKEN_PERMANENTE_DA_META",
    "phoneNumberId": "ID_DO_NUMERO",
    "businessAccountId": "ID_DA_WABA",
    "appSecret": "APP_SECRET_DO_APP_META",
    "verifyToken": "UM_TOKEN_QUE_VOCE_ESCOLHE",
    "apiVersion": "v21.0"
  }
}
```

> `appSecret` e **obrigatorio**: sem ele a API rejeita o webhook `POST` (valida HMAC). `verifyToken` e usado no `GET` de verificacao — escolha um valor unico por canal.

3. No Meta Business / App Dashboard, cadastre o webhook:
   - **Callback URL**: `https://SEU_DOMINIO_API/api/v1/webhooks/WHATSAPP_OFFICIAL`
   - **Verify Token**: o mesmo `verifyToken` do canal.
   - Inscreva o campo `messages`.

4. A Meta chama `GET .../webhooks/WHATSAPP_OFFICIAL` (a API testa o `verifyToken` dos canais ativos e devolve o `hub.challenge`). Depois, mensagens chegam via `POST` na mesma rota.

5. Teste ponta a ponta: envie do seu celular para o numero conectado e confirme:
   - registro nas tabelas `messages` e `conversations`;
   - aparece em tempo real no frontend (Socket.io);
   - o agente de IA responde automaticamente.

Se algo travar, copie o log exato do container `api` (nao resuma) para diagnostico.

---

## 6. Subir para o GitHub e ligar no Coolify (passo a passo)

### 6.1 Enviar o projeto para o GitHub

Na raiz do projeto (`chat.axory`), com o repo git que ja existe:

```sh
git add .
git commit -m "AxChat: rebrand, DeepSeek, compose e deploy"
# crie um repo vazio no GitHub (ex: github.com/voce/axchat) e:
git remote add origin https://github.com/SEU_USUARIO/axchat.git
git push -u origin main
```

> O `.env` da raiz e os `.env` internos estao no `.gitignore` — os segredos NAO vao pro GitHub. As credenciais reais voce coloca no painel do Coolify (passo 6.4).

### 6.2 Criar a aplicacao no Coolify

1. No Coolify: **Project** (use o mesmo do Axdeal ou crie um novo) -> **+ New Resource**.
2. Escolha **Docker Compose** (ou "Application" e depois Build Pack = Docker Compose).
3. **Source**: conecte sua conta GitHub (GitHub App) e selecione o repo `axchat`, branch `main`.
4. **Compose file location**: `docker-compose.yml` (raiz). O `Base Directory` fica `/`.
5. Salve. O Coolify le o compose e mostra os 3 servicos: `api`, `web`, `mcp`.

### 6.3 Conferir a rede externa

O compose ja usa a rede externa `coolify` (mesma do Postgres/Redis do Axdeal). Como o Traefik do Coolify tambem vive nessa rede, ele consegue rotear para os containers. Nao precisa criar rede nova.

### 6.4 Variaveis de ambiente (no painel do Coolify)

Em **Environment Variables**, cole o conteudo de [.env.coolify.example](.env.coolify.example) e preencha os valores reais (Postgres/Redis ja descobertos; dominios e DeepSeek voce define). Pontos importantes:

- `NEXT_PUBLIC_API_URL` precisa estar disponivel **no build** do `web` (e build arg). No Coolify, marque essa variavel como **Build Variable / Available at buildtime**.
- `DEEPSEEK_API_KEY` pode ficar vazia — a chave e colocada depois pela UI (Settings > IA).
- Gere/mantenha `JWT_SECRET` e `JWT_REFRESH_SECRET`.

### 6.5 Dominios por servico

No Coolify, em cada servico do compose, defina o **Domain** (o Coolify gera os labels do Traefik sozinho):

- `web`  -> `https://chat.seudominio.com`  (porta interna **3000**)
- `api`  -> `https://api.chat.seudominio.com`  (porta interna **3001**)
- `mcp`  -> opcional, so se for expor (porta **3110**)

Aponte os registros DNS (A/AAAA) desses subdominios para o IP do VPS. Use subdominios diferentes dos do Axdeal — como o roteamento e por host, nao ha conflito.

### 6.6 Primeiro deploy

1. Clique em **Deploy**. O Coolify faz o build das imagens (`api`, `web`, `mcp`) e sobe os containers.
2. No primeiro start, o container `api` roda sozinho:

```sh
npx prisma migrate deploy && node dist/src/main
```

   Isso aplica as migrations no `axchat_db` (inclui a coluna nova `deepseek_api_key`).
3. Aguarde o healthcheck do `api` ficar verde (`GET /health` -> 200).

### 6.7 Pos-deploy (criar usuario, agentes e chave DeepSeek)

- Crie o primeiro usuario pela tela `/register`, ou rode o seed via terminal do container `api` no Coolify:

```sh
npm run prisma:seed --prefix axchat-api     # admin@bravy.com / Admin@123 (troque!)
npm run prisma:seed:agents --prefix axchat-api  # agentes ja com deepseek-chat
```

- Faca login no frontend, va em **Settings > IA** e cole a **Chave de API DeepSeek**. Pronto: os agentes passam a responder via DeepSeek.

---

## 7. Atualizacao por git push (deploy continuo)

Com o repo conectado e o webhook do GitHub ativo no Coolify, cada push na branch `main` dispara um novo build/deploy automatico:

```sh
git add .
git commit -m "ajustes"
git push
```

> Garanta no Coolify que **Automatic Deployment** (webhook do GitHub) esta ligado para a branch `main`.
