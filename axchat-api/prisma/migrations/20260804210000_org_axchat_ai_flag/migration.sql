-- Motor de IA por organização, controlado pelo Super Admin.
-- true  = "IA AxChat": roda nas chaves globais da AxChat; o cliente não configura chave.
-- false = "IA própria": o cliente traz o motor dele (chave DeepSeek e/ou AiModelProvider).
ALTER TABLE "organizations"
  ADD COLUMN "axchat_ai_enabled" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: quem JÁ traz motor próprio hoje continua com motor próprio, pra que
-- ligar a flag não redirecione silenciosamente o consumo desses clientes pras
-- nossas chaves (nem descarte a chave que eles configuraram e já funciona).
UPDATE "organizations" o
SET "axchat_ai_enabled" = false
WHERE (o."deepseek_api_key" IS NOT NULL AND btrim(o."deepseek_api_key") <> '')
   OR EXISTS (
        SELECT 1
        FROM "ai_model_providers" p
        WHERE p."organization_id" = o."id"
          AND p."api_key" IS NOT NULL
          AND btrim(p."api_key") <> ''
      );
