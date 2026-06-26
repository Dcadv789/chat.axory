# Conectar Google Calendar pessoal (OAuth) — o que criar e me enviar

Pra o Assistente Pessoal ler E criar eventos no Google Calendar do dono, é preciso
um **app OAuth do Google**. Você cria uma vez no Google Cloud e me envia 3 valores.
Eu construo e testo a integração assim que receber.

## Passo a passo (Google Cloud Console)

1. Acesse **console.cloud.google.com** → crie/seleciona um projeto (ex: "AxChat").
2. **APIs e serviços → Biblioteca** → ative a **Google Calendar API**.
3. **APIs e serviços → Tela de permissão OAuth** (OAuth consent screen):
   - Tipo de usuário: **Externo** (a menos que todos sejam do mesmo Google Workspace).
   - Preencha nome do app, e-mail de suporte e contato.
   - Em **Escopos**, adicione: `https://www.googleapis.com/auth/calendar.events`
     (ler/criar/editar eventos) e `.../auth/calendar.readonly` se quiser leitura ampla.
   - Em **Usuários de teste**, adicione o e-mail do dono enquanto o app estiver em
     modo de teste (ou publique o app pra liberar geral).
4. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo de aplicativo: **Aplicativo da Web**.
   - **URIs de redirecionamento autorizados** — adicione (os dois, dev e prod):
     - Dev:  `http://localhost:3001/api/v1/personal-assistant/google/callback`
     - Prod: `https://SEU_DOMINIO_API/api/v1/personal-assistant/google/callback`
   - Crie e copie o **Client ID** e o **Client Secret**.

## O que me enviar

1. **GOOGLE_CLIENT_ID** (ex: `123456-abc.apps.googleusercontent.com`)
2. **GOOGLE_CLIENT_SECRET** (ex: `GOCSPX-...`)
3. Confirmar o **redirect URI** que você cadastrou (uso o de dev pra testar:
   `http://localhost:3001/api/v1/personal-assistant/google/callback`).

> As credenciais ficam no `.env` do servidor (global, gitignored) — o app OAuth é
> da plataforma; cada **usuário** conecta a própria conta Google e o token dele
> fica salvo por usuário no banco. (Mesmo modelo do MinIO: credencial de
> infraestrutura no servidor, dado por-tenant/usuário no banco.)

## O que eu construo quando receber

- Botão **"Conectar Google"** na página do Assistente → fluxo OAuth (consent →
  callback → guarda access/refresh token do usuário).
- Sincronização: eventos do Google aparecem na agenda do assistente
  (`source=GOOGLE`), e quando o assistente cria um compromisso, ele também grava
  no Google Calendar do dono.
- Refresh automático do token. Botão **"Desconectar"**.
