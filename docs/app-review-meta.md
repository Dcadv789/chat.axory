# App Review da Meta — AxChat Social (`1677293733555162`)

Tudo que a submissão do app de Instagram/Threads/Ads precisa: quais permissões
pedimos, por que cada uma existe no código, e o texto de "uso permitido" pronto
pra colar no painel.

> **Só mexer neste app.** Os apps de WhatsApp (`AxChat` 1906464760047808 e
> `Chat.Axory.API` 1527760795404234) são outros e não entram nesta submissão.

## Decisões que já foram tomadas

- **Facebook Login for Business**, não Instagram Login. Não é preferência: a doc
  da Meta diz que um app usa *"Facebook Login **or** Instagram Login, but not
  both"*. O Instagram Login também não dá acesso a Ads nem à Página, e nós
  usamos os dois.
- **Threads entra na mesma submissão** (o código já está pronto).
- As permissões `instagram_business_*`, `instagram_manage_contents`,
  `ads_mcp_management`, `catalog_management` e `business_management` foram
  **removidas** — nenhuma tinha código que a usasse.

## Permissões pedidas e onde cada uma é usada

| Permissão | Endpoint no código | Arquivo |
|---|---|---|
| `instagram_basic` | `GET /{ig-id}?fields=id,username`, `GET /{ig-id}/media` | `instagram.http-client.ts` |
| `instagram_manage_messages` | `POST /{page-id}/messages`, `GET /{self}/conversations` | `instagram.http-client.ts:257` |
| `instagram_manage_comments` | `POST /{comment-id}/replies` | skill `replyToInstagramComment` |
| `instagram_manage_insights` | `GET /{media-id}/insights` | `capture-instagram-metrics.tool.ts` |
| `instagram_content_publish` | `POST /{ig-id}/media` + `/media_publish` | `marketing-publish.service.ts` |
| `pages_show_list` | `GET /me/accounts` | `instagram.http-client.ts:507` |
| `pages_read_engagement` | `GET /{page-id}?fields=name,access_token` | `instagram.http-client.ts:620` |
| `pages_manage_metadata` | `POST /{page-id}/subscribed_apps` | `instagram.http-client.ts:123` |
| `pages_messaging` | `POST /{page-id}/messages` | `instagram.http-client.ts:274` |
| **Human Agent** (feature) | `messaging_type=MESSAGE_TAG` + `tag=HUMAN_AGENT` | `instagram.message-mapper.ts` |
| `ads_read` / `ads_management` | `/act_{id}/campaigns`, pausar/ativar | `marketing-ads.service.ts` |
| Marketing API Access Tier | volume de produção do Ads | — |
| `threads_basic` … `_manage_insights` (5) | `graph.threads.net` | `threads.http-client.ts` |
| `public_profile` | auto-concedida | — |

`pages_read_engagement` é **pré-requisito de `ads_management`** e do content
publish — não é opcional, mesmo parecendo.

## Excluir post pela API: não dá (e por quê)

`instagram_manage_contents` **não deve ser pedida** na submissão. Verificado em
três fontes:

1. **Changelog do Instagram Platform (03/12/2025)** — lançou
   `DELETE /{ig_media_id}` exigindo a permissão nova `instagram_manage_contents`.
2. **Referência do IG Media** — *"This api only supports Instagram API with
   Facebook login only"*. Instagram Login não exclui.
3. **Tabela "Supported permissions" do Facebook Login for Business** — lista as
   permissões de Instagram que o FLB consegue pedir:
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`,
   `instagram_manage_insights`, `instagram_manage_messages`,
   `instagram_shopping_tag_products`. **`instagram_manage_contents` não está lá.**

Resultado: o endpoint só aceita Facebook Login, e o Facebook Login não sabe
pedir a permissão que ele exige. Lacuna da Meta, não configuração errada — por
isso a permissão aparece no App Review mas não nas opções do login.

Na prática: a tela consulta os escopos reais do token e troca o botão por
"Excluir pelo Instagram", desabilitado. O endpoint continua implementado; no dia
em que a Meta adicionar a permissão ao FLB, basta reconectar o canal e o botão
volta sozinho.

Não repetir: criar configuração nova de login **não** resolve, já foi tentado.

## Webhook de comentário só funciona depois do App Review

Sintoma: DM do Instagram chega no inbox, comentário nunca. Investigado até o
fim em 06/08/2026 na conta real (Axory Capital Group, IG `17841458024232453`,
Página `105844012423899`) — **não é bug nosso**.

O que foi conferido e está CERTO:

- App `1677293733555162`, objeto `instagram`: `comments` assinado, junto com
  `messages`, `standby`, `messaging_referral`, `messaging_postbacks`,
  `message_reactions`, `messaging_seen`.
- Token do canal (`debug_token`): válido, System User do app certo, com
  `instagram_manage_comments`, `instagram_basic`, `pages_manage_metadata`,
  `pages_read_engagement`, `pages_show_list`.
- `POST /{page}/subscribed_apps` com `messages`: ativo. Incluir `comments` é
  impossível — a Meta responde `(#100) Param subscribed_fields[0] must be one
  of {feed, mention, …} - got "comments"`. O enum daquele nó é o de Página.
- 30 webhooks recebidos, todos `object: instagram`, todos DM. Nenhum
  `changes[field=comments]` jamais.

O que FALTA, direto da doc *Webhooks from Meta → Instagram*:

> Your app must have successfully completed App Review (advanced access) to
> receive webhooks notifications for `comments` and `live_comments` webhooks
> fields.
>
> For Business apps, they must have permissions with an Advanced Access level.
> **If the app permissions don't have an access level of Advanced Access, the
> app doesn't receive webhook notifications.**

Hoje `instagram_manage_comments` está em `access_level: none`. Por isso DM
funciona e comentário não: DM entra pela Messenger Platform, que roda em
Development Mode pra quem tem papel no app; `comments` é explicitamente
barrado sem Advanced Access.

Consequência prática: **a automação de comentário não tem como ser testada
antes da aprovação.** Não adianta mexer em inscrição, permissão de token ou
código. A mesma doc ainda exige que o Business ligado à Página esteja
verificado e que a conta não seja privada.

## Textos de "uso permitido"

Em inglês de propósito: os revisores são globais e a doc recomenda inglês.

### instagram_basic
After a business owner connects via Facebook Login for Business, we call
GET /{ig-user-id}?fields=id,username to identify which Instagram professional
account was linked and display it in our Channels screen so the owner can
confirm it is the right one. We also list the account's own media via
GET /{ig-user-id}/media. We never access accounts other than the one the owner
connected.

### instagram_manage_messages
AxChat is a shared team inbox for small businesses. This permission lets a
business read and reply to Instagram Direct messages sent to their own
professional account. Incoming DMs arrive through the `messages` webhook and
appear in our web inbox, where the business's agents assign conversations
between team members and reply via POST /{page-id}/messages. Businesses may
also enable an AI assistant they configure themselves to draft or send replies;
this is opt-in and can be turned off at any time.

### instagram_manage_comments
Businesses moderate and answer comments left on their own Instagram posts and
Reels from AxChat. We receive the `comments` webhook, show the comment together
with the post it belongs to, and publish the reply via
POST /{comment-id}/replies. Replies are written either by the business's human
agents or by an AI assistant the business owner configures and enables for their
own account.

### instagram_manage_insights
We show business owners how their own content performs. We call
GET /{ig-user-id}/media to list their posts and GET /{media-id}/insights for
reach, likes, comments, saved, shares and total_interactions, then render a
performance table in our Marketing screen. Metrics are stored only for the
business that owns them.

### instagram_content_publish
Business owners compose and publish their own content to their Instagram
professional account from AxChat's Marketing screen. We use the documented
two-step flow: POST /{ig-user-id}/media to create the container (image, Reel,
Story or carousel) and POST /{ig-user-id}/media_publish to publish, polling
GET /{container-id}?fields=status_code while video is processing. We also check
GET /{ig-user-id}/content_publishing_limit to respect the 100-posts-per-24h
limit.

### pages_show_list
During channel setup we call GET /me/accounts to show the owner the Facebook
Pages they manage, so they can select the Page linked to the Instagram
professional account they want to connect. Without it we cannot identify the
correct Page/Instagram pair or obtain the Page access token the Instagram
Messaging API requires.

### pages_read_engagement
We call GET /{page-id}?fields=name,access_token to confirm the selected Page and
obtain its access token, which is required for Instagram messaging and content
publishing. It is also the documented prerequisite for instagram_content_publish
and ads_management.

### pages_manage_metadata
At connection time we call POST /{page-id}/subscribed_apps to subscribe our app
to the selected Page's webhooks, so the business receives their Instagram Direct
messages and comments in AxChat in real time. This runs once, only on the Page
the owner selected.

### pages_messaging
Instagram Direct messages for a professional account linked to a Facebook Page
are delivered through the Page (POST /{page-id}/messages) using the Instagram
Messaging API. This permission is what allows our shared inbox to send the
business's replies to their own Instagram customers.

### Human Agent
AxChat is a human-operated shared inbox. When a customer writes outside business
hours, or the answer requires research (for example checking a document or an
order), a human agent on the business's team may need more than 24 hours to
reply. In that case we send the reply with messaging_type=MESSAGE_TAG and
tag=HUMAN_AGENT, within the 7-day window. The tag is applied only when the reply
was written by an authenticated human operator signed in to AxChat: our code
requires a real user as the message sender and explicitly excludes AI-generated
and automated messages from ever receiving this tag.

### ads_read
Business owners connect their own ad account to see campaign performance inside
AxChat. We read GET /act_{ad-account-id}/campaigns and the insights edge to
display spend, results and budget pacing next to the conversations those ads
generated.

### ads_management
From AxChat's marketing panel the owner can act on their own campaigns — pause,
resume or archive one when performance drops or the budget runs out. Writes
happen only on the owner's own ad account and only when they explicitly trigger
the action.

### Marketing API Access Tier
Each connected business has its own ad account and reads campaign insights on a
recurring schedule. As a Tech Provider serving multiple business clients,
development-tier limits are not sufficient.

### threads_basic
Required for all Threads endpoints. After the business connects their Threads
profile we call GET /me to identify it and confirm it in our Channels screen.

### threads_content_publish
Businesses publish their own Threads posts (text, image, video and carousel)
from AxChat's marketing screen, using the container-then-publish flow on
graph.threads.net.

### threads_read_replies
We call GET /{media-id}/replies and the conversation endpoint to show the
business the replies their own Threads posts received, in the same panel where
they manage Instagram.

### threads_manage_replies
The business replies to and hides replies on their own Threads posts from
AxChat — the moderation counterpart to reading them.

### threads_manage_insights
We read GET /{media-id}/insights and GET /{threads-user-id}/threads_insights to
show the business how their own Threads content performed, next to their
Instagram metrics. Profile insights are requested with a since/until range
chosen by the business owner in the UI; without a range the API returns only two
days.

### threads_delete
Business owners remove their own Threads posts from AxChat, in the same list
where they publish and moderate them — typically to take down a post with a
typo, outdated pricing or an offer that ended. We call
DELETE /{threads-media-id} only for media owned by the connected account, only
when the owner explicitly confirms it in a dialog that states the action cannot
be undone. AI agents never delete content: deletion is available only to users
with the OWNER or ADMIN role, from a manual click.

### public_profile
Granted by default with Facebook Login. We use it only to show the name of the
person who is signed in while they connect their business accounts, so it is
clear which identity is being used to authorize the connection. We do not store
or process it beyond the session.

### public_profile
Sem campo de texto — só marcar a conformidade.

## Por que declaramos a IA nos textos

O revisor **testa o app**. A crew de marketing responde comentário sozinha
(`inbound-message.processor.ts` roteia direto pro worker de comentários, sem
card de aprovação). Se o texto dissesse só "o negócio responde" e o revisor
visse um bot, seria reprovação por descrição enganosa. Declarado como opt-in
configurado pelo dono, está dentro da política.

## Ordem que a Meta impõe

1. **1 chamada de API real por permissão** — o botão de "Request advanced
   access" fica cinza até a Meta registrar. Vale 30 dias e leva **até 2 dias**
   pra aparecer.
2. Texto de uso permitido + screencast por permissão.
3. Data Use Checkup — **não** é exigido em Development mode, só antes do Live.
4. Submeter e esperar aprovação.
5. **Só então** virar Live. A doc é explícita: em Live o app só consegue pedir
   permissão **aprovada**, e isso vale inclusive pra quem tem papel no app —
   virar Live antes da aprovação quebra o app até pra nós.

## Roteiro dos screencasts

Sete gravações cobrem as vinte permissões. A Meta pede um vídeo por permissão,
mas o mesmo arquivo pode ser enviado em mais de uma — o que ela avalia é se o
revisor consegue **reproduzir** o que viu. Por isso cada roteiro começa no
login: sem ver de onde a tela saiu, o revisor não sabe que é o nosso app.

Regras que valem pros sete:

- Grave em **inglês** (fala ou legenda). Revisor é global.
- Comece **deslogado**, faça login no AxChat e navegue com o mouse até a tela.
  Nada de abrir a URL direto — parece tela avulsa.
- **Não use o Graph API Explorer.** A Meta quer o app usando a permissão.
- Deixe a resposta aparecer na tela: o post publicado, o comentário respondido,
  o número que mudou. Ação sem resultado visível conta como não demonstrada.
- Sem cortes no meio de uma ação.

### Vídeo 1 — Conectar Instagram
Cobre: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`,
`instagram_basic`

1. Login no AxChat.
2. Configurações → Canais → **Novo Canal** → Instagram.
3. Popup do Facebook Login: mostre a **lista de Páginas** aparecendo
   (`pages_show_list`) e escolha a Página ligada ao Instagram.
4. Volte ao AxChat com o canal criado — mostre o nome da Página e da conta IG
   (`pages_read_engagement`).
5. Abra o canal → bloco **Diagnóstico de webhook** → "Recebimento ativado" com
   os campos inscritos (`pages_manage_metadata`).
6. Gestão de Marketing → **Conta**: foto, @, bio, seguidores, publicações
   (`instagram_basic`).

### Vídeo 2 — Publicar no Instagram
Cobre: `instagram_content_publish`

1. Login → Gestão de Marketing → Conteúdo → **Publicar**.
2. Aba Instagram, formato **Post único**: envie uma imagem do computador,
   escreva a legenda, clique em **Publicar no Instagram**.
3. Mostre a confirmação e vá em **Posts do Instagram** — o post novo na grade.
4. Volte e mostre o formato **Carrossel** com 2 itens (não precisa publicar de
   novo; mostrar que existe já cobre o fluxo).
5. Mostre o botão **Agendar**, escolha data/hora e confirme — o chip aparece no
   calendário ao lado.

### Vídeo 3 — Comentários do Instagram
Cobre: `instagram_manage_comments`

1. Login → Gestão de Marketing → Conteúdo → **Comentários**.
2. Escolha um post com comentários na coluna da esquerda.
3. **Responder**: clique no ícone de resposta, escreva, publique — mostre a
   resposta aparecendo aninhada.
4. **Ocultar**: oculte um comentário; ele fica com o selo âmbar "oculto no
   Instagram". Reexiba em seguida.
5. **Excluir**: exclua um comentário de teste, confirmando no diálogo.

### Vídeo 4 — Métricas do Instagram
Cobre: `instagram_manage_insights`

1. Login → Gestão de Marketing → Conteúdo → **Métricas dos posts**.
2. Ajuste o período na barra de filtro.
3. Mostre a tabela: alcance, curtidas, comentários, salvos, compartilhamentos,
   interações e taxa de engajamento — e o gráfico por dia.

### Vídeo 5 — Inbox, DM e Human Agent
Cobre: `instagram_manage_messages`, `pages_messaging`, **Human Agent**

1. Login → **Inbox**.
2. Mande uma DM de outra conta pro perfil e mostre ela **chegando** na lista.
3. Responda pelo inbox e mostre a mensagem entregue no Instagram
   (`instagram_manage_messages` + `pages_messaging`).
4. Para **Human Agent**: abra uma conversa cuja última mensagem do cliente tem
   **mais de 24h** (a data aparece na tela). Responda como atendente logado.
5. Narre, porque é o ponto que a Meta avalia: *"this reply is written by a
   human agent signed in to AxChat, more than 24 hours after the customer's
   last message, so it is sent with the HUMAN_AGENT tag. Automated and
   AI-generated messages never use this tag."*

### Vídeo 6 — Anúncios
Cobre: `ads_read`, `ads_management`, `Marketing API Access Tier`

1. Login → Gestão de Marketing → **Anúncios**.
2. **Resumo**: verba do mês, gasto, impressões, alcance, cliques, CTR, CPC
   (`ads_read`).
3. **Gestão de anúncios**: a tabela de campanhas ao vivo.
4. **Pause** uma campanha e mostre o status mudando; ative de novo
   (`ads_management`).
5. Abra o detalhe da campanha e **edite o orçamento diário**.
6. **Métricas dos anúncios**: série por campanha ao longo do tempo.

### Vídeo 7 — Threads
Cobre: `threads_basic`, `threads_content_publish`, `threads_read_replies`,
`threads_manage_replies`, `threads_manage_insights`, `threads_delete`

Pré-requisito: um post publicado no Threads **com pelo menos uma resposta de
outra conta**. Sem isso os passos 4 e 5 ficam vazios.

1. Login → Configurações → Canais → Novo Canal → **Threads** → autorize →
   volte com o canal criado (`threads_basic`).
2. Gestão de Marketing → Conteúdo → Publicar → aba **Threads** → escreva e
   publique (`threads_content_publish`).
3. Aba **Threads** → **Retorno geral**: visualizações, curtidas, respostas,
   reposts, citações, seguidores e o gráfico por dia
   (`threads_manage_insights`).
4. Escolha o post → as **respostas** aparecem (`threads_read_replies`).
5. **Responda** uma resposta e depois **oculte** outra
   (`threads_manage_replies`).
6. Mostre o bloco **Desempenho** do post (`threads_manage_insights`).
7. **Exclua** um post de teste pela lixeira, confirmando no diálogo
   (`threads_delete`).

### Sem screencast
`public_profile` pede só o Data Use Checkup — não tem vídeo.

## O que falta pra submeter (checklist)

- [ ] Publicar 1 post no Threads e conseguir 1 resposta de outra conta
- [ ] Colar os 20 textos de uso permitido
- [ ] `pages_messaging`: indicar a Página de teste (passo `test_page`)
- [ ] Gravar os 7 vídeos
- [ ] **Data Use Checkup** — uma vez pro app inteiro, não por permissão
- [ ] Conferir no PAINEL quais `api_precheck` faltam (o MCP atrasa)
