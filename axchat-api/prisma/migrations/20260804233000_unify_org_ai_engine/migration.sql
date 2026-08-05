-- Unifica a configuração de IA da organização num lugar só.
--
-- Antes o cliente tinha DOIS lugares: a coluna `organizations.deepseek_api_key`
-- (card "Chave de API DeepSeek") e as linhas de `ai_model_providers` (seção de
-- modelos). Agora tudo vira linha de `ai_model_providers`, alimentada pela tela
-- "Adicionar IA".
--
-- A coluna `deepseek_api_key` NÃO é removida de propósito: o runtime segue lendo
-- ela como fallback legado, então se algum registro escapar deste backfill o
-- cliente não fica sem IA. Removê-la fica pra uma limpeza futura, depois de
-- confirmar que ninguém mais depende dela.
--
-- `modelId` é camelCase no banco (o Prisma não mapeou essa coluna) — daí as aspas.
INSERT INTO "ai_model_providers" (
  "id",
  "organization_id",
  "provider",
  "name",
  "modelId",
  "api_key",
  "base_url",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  'deepseek',
  'DeepSeek Chat',
  'deepseek-chat',
  btrim(o."deepseek_api_key"),
  NULL,
  true,
  now(),
  now()
FROM "organizations" o
WHERE o."deepseek_api_key" IS NOT NULL
  AND btrim(o."deepseek_api_key") <> ''
  -- Não duplica quem já cadastrou o mesmo modelo pela tela de modelos.
  AND NOT EXISTS (
    SELECT 1
    FROM "ai_model_providers" p
    WHERE p."organization_id" = o."id"
      AND p."modelId" = 'deepseek-chat'
  );
