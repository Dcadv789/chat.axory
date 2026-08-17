-- Origem do lead: qual anúncio trouxe a conversa.
--
-- A Meta manda `messaging_referral` no primeiro contato de quem clica num
-- anúncio de clique-para-mensagem, e o adapter do Instagram já extraía `ad_id`,
-- `ad_title` e `source` — só que virava texto numa mensagem de sistema
-- ("[Cliente chegou por anúncio X]") e morria ali. Não dava pra perguntar
-- "quantos leads o anúncio X trouxe" nem cruzar com o gasto.
--
-- Com isto, Card.value + Card.status WON + Conversation.ad_id respondem custo
-- por cliente adquirido, que é o número que faltava pra crew ser gestora de
-- tráfego e não só operadora de anúncios.
--
-- Tudo opcional e sem default: nenhuma conversa existente muda, nenhum código
-- atual depende destas colunas.

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "ad_id"            TEXT,
  ADD COLUMN IF NOT EXISTS "ad_title"         TEXT,
  ADD COLUMN IF NOT EXISTS "referral_source"  TEXT;

CREATE INDEX IF NOT EXISTS "idx_conv_org_ad"
  ON "conversations" ("organization_id", "ad_id");
