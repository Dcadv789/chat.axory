# Assinar comentários do Instagram no webhook (Meta)

Pra a automação **comentário → resposta + DM** funcionar, o app da Meta precisa
**assinar o campo `comments`** e mandar os eventos pro nosso webhook. Sem isso, o
Instagram entrega só DMs — comentário nenhum chega, e o agente nunca é acionado.

> O que o sistema já faz: ao receber um evento de comentário, ele roteia direto
> pra crew de marketing (Magnus → Caspian), que responde o comentário e manda o
> material/link na DM. Falta só **ligar o envio do evento** no painel da Meta.

---

## Pré-requisitos

- App no **Meta for Developers** com o produto **Instagram** (Graph API) adicionado.
- Conta **Instagram Business/Creator** vinculada a uma **Página do Facebook**.
- Permissões aprovadas no app: `instagram_basic`, `instagram_manage_comments`,
  `instagram_manage_messages` (DM), `pages_show_list`, `pages_read_engagement`.
- O **canal Instagram já criado no AxChat** (Configurações → Canais), com o
  **verify token** que você definiu na criação.

## URL do webhook (callback)

```
https://SEU_DOMINIO_API/api/v1/webhooks/INSTAGRAM
```

- Em produção: `https://api-chat.axory.com.br/api/v1/webhooks/INSTAGRAM`.
- O **Verify Token** tem que ser **igual** ao definido ao criar o canal Instagram
  no AxChat (Configurações → Canais → Instagram).
- A URL também está pronta pra copiar em **Configurações → Integrações → Instagram/Meta**.

---

## Passo a passo no painel

1. **developers.facebook.com** → seu App.
2. Menu lateral → **Webhooks** (ou **Produtos → Webhooks**).
3. No seletor de objeto, escolha **Instagram** → **Subscribe to this object**.
4. Em **Callback URL**, cole a URL do webhook acima.
   Em **Verify Token**, cole o mesmo verify token do canal.
   Clique **Verify and Save** (a Meta faz um GET de verificação — o AxChat
   responde o `hub.challenge` automaticamente).
5. Na lista de **campos (fields)**, clique **Subscribe** em:
   - **`comments`** ← obrigatório para esta automação
   - **`messages`** (DMs, se ainda não estiver)
   - (opcional) `mentions`, `message_reactions`.
6. **Assine a Página/conta** ao app (passo que as pessoas mais esquecem). Via
   Graph API, com um **Page Access Token**:
   ```
   POST https://graph.facebook.com/v21.0/{page-id}/subscribed_apps
        ?subscribed_fields=comments,messages
        &access_token={PAGE_ACCESS_TOKEN}
   ```
   Resposta esperada: `{"success": true}`.
   Para conferir o que está assinado:
   ```
   GET https://graph.facebook.com/v21.0/{page-id}/subscribed_apps?access_token={PAGE_ACCESS_TOKEN}
   ```

---

## Testar

1. **Webhooks → Instagram → Test** → evento **`comments`** → **Send to Server**
   (manda um payload de exemplo).
2. Ou faça um **comentário real** num post da conta business (de outro perfil —
   comentário da própria conta é ignorado de propósito).
3. Confira no AxChat:
   - Aparece uma conversa/mensagem interna com o comentário e a linha de contexto
     (`commentId`, `recipientId`, `mediaId`).
   - Nos logs da API: `Comentário IG → marketing (Magnus) conv=...`.
   - Em **Configurações → Marketing → (log)** / `marketing_activities`: atividade
     registrada.

---

## Formato do evento (referência)

```json
{
  "object": "instagram",
  "entry": [{
    "id": "<IG_USER_ID>",
    "time": 1700000000,
    "changes": [{
      "field": "comments",
      "value": {
        "id": "<COMMENT_ID>",
        "text": "vocês entregam pra todo Brasil?",
        "from": { "id": "<IGSID_DO_AUTOR>", "username": "fulano" },
        "media": { "id": "<MEDIA_ID>" },
        "parent_id": "<COMMENT_PAI_se_for_resposta>"
      }
    }]
  }]
}
```

- `value.from.id` é o **IGSID** do autor — é o `recipientId` que o agente usa pra
  mandar a **DM** (não é o `@username`).
- `value.id` é o **commentId** — usado pra **responder o comentário**.

---

## Erros comuns

- **Não chega nada**: a Página não foi assinada ao app (passo 6) ou o campo
  `comments` não está com **Subscribe** marcado.
- **Verificação falha (403)**: o Verify Token não bate com o do canal no AxChat.
- **DM não envia**: falta permissão `instagram_manage_messages`, ou a janela de
  mensagem (a Meta limita DM proativa fora de janela de 24h em alguns casos).
- **Comentário da própria conta dispara**: não dispara — eventos cujo
  `from.id` é a própria conta são ignorados.
