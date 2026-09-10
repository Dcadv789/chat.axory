-- Qual provedor DO CLIENTE atende cada motor.
--
-- A organização já podia dizer "eu pago minha IA" (`axchat_ai_enabled = false`)
-- e registrar provedores próprios. Só que a escolha de qual usar saía do
-- `model_id` do agente casando com o nome de um provedor registrado — e quando
-- não casava, a chamada caía na chave da AxChat sem avisar ninguém. A empresa
-- dizia que pagava a própria IA e a plataforma pagava a conta.
--
-- Agora a organização aponta explicitamente o provedor de TEXTO e o de VISÃO.
--
-- EMBEDDING fica de fora de propósito: a busca semântica é infraestrutura da
-- plataforma. O índice é organizado por modelo — deixar cada cliente escolher
-- o dele significaria um espaço vetorial por organização e reindexação a cada
-- troca. Esse custo é nosso.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "ai_text_provider_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "ai_vision_provider_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_ai_text_provider_fk"
    FOREIGN KEY ("ai_text_provider_id") REFERENCES "ai_model_providers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_ai_vision_provider_fk"
    FOREIGN KEY ("ai_vision_provider_id") REFERENCES "ai_model_providers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Quem já tem UM provedor de texto ativo não precisa reconfigurar: adota ele.
-- Com mais de um, ninguém adivinha qual — fica pro cliente escolher na tela.
UPDATE "organizations" o
   SET "ai_text_provider_id" = (
     SELECT p."id" FROM "ai_model_providers" p
      WHERE p."organization_id" = o."id" AND p."is_active" = true
      LIMIT 1
   )
 WHERE o."axchat_ai_enabled" = false
   AND o."ai_text_provider_id" IS NULL
   AND (SELECT count(*) FROM "ai_model_providers" p
         WHERE p."organization_id" = o."id" AND p."is_active" = true) = 1;
