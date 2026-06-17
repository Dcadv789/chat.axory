# Deploy no Coolify

Este repositório contém três serviços:

- `api`: backend NestJS, Prisma, PostgreSQL, Redis/BullMQ.
- `web`: frontend Next.js.
- `mcp`: servidor MCP para consultar indicadores da API.

## 1. Banco e Redis

Você pode usar PostgreSQL, Redis e MinIO já existentes na VPS. Para este código, os obrigatórios são PostgreSQL e Redis.

O MinIO aparece no `.env.example` original, mas o código atual de uploads usa disco local em `UPLOADS_DIR`. O `docker-compose.yml` já cria um volume persistente `api_uploads` para isso.

## 2. Variáveis no Coolify

No Coolify, crie um app usando Docker Compose e aponte para `docker-compose.yml`.

Copie as variáveis de `.env.coolify.example` para o painel do Coolify e ajuste:

- `DATABASE_URL`: URL do PostgreSQL 17 Alpine.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: dados do Redis.
- `APP_URL`: domínio público da API, sem `/api/v1`.
- `CORS_ORIGIN`: domínio público do frontend.
- `NEXT_PUBLIC_API_URL`: domínio público da API com `/api/v1`.
- `JWT_SECRET` e `JWT_REFRESH_SECRET`: gere valores longos e aleatórios.
- `ANTHROPIC_API_KEY`: necessário para agentes de IA.
- `OPENAI_API_KEY`: necessário para embeddings/transcrição.

Exemplo:

```env
APP_URL=https://api.chat.seudominio.com
CORS_ORIGIN=https://chat.seudominio.com
NEXT_PUBLIC_API_URL=https://api.chat.seudominio.com/api/v1
DATABASE_URL=postgresql://usuario:senha@postgres-host:5432/chat_bullq?schema=public
REDIS_HOST=redis-host
REDIS_PORT=6379
```

## 3. Primeiro deploy

No primeiro deploy, o container da API executa automaticamente:

```sh
npx prisma migrate deploy
node dist/src/main
```

Depois que subir, crie o primeiro usuário pela tela `/register` ou rode o seed da API, se quiser usar o admin padrão do código:

```sh
npm run prisma:seed --prefix chat-bullq-api-main
```

Credenciais do seed:

```txt
admin@bravy.com
Admin@123
```

Troque essa senha imediatamente se usar em ambiente público.

## 4. Domínios sugeridos

- Frontend: `https://chat.seudominio.com` apontando para serviço `web`, porta `3000`.
- API: `https://api.chat.seudominio.com` apontando para serviço `api`, porta `3001`.
- MCP: exponha apenas se precisar, serviço `mcp`, porta `3110`.

## 5. Atualização por git push

Fluxo esperado:

```sh
git add .
git commit -m "Deploy Chat BullQ monorepo"
git push
```

Com o repositório conectado no Coolify, cada push pode disparar novo build/deploy.
