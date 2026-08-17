-- Briefing por campanha + restrições da empresa.
--
-- O perfil de marketing responde "quem é a empresa". Não havia onde responder
-- "o que ESTA campanha está tentando conseguir" — e duas campanhas no ar ao
-- mesmo tempo podem querer coisas opostas: uma captando lead frio para BPO,
-- outra reativando cliente antigo de consultoria. Com um perfil só, a crew
-- tratava as duas com a mesma mensagem e o mesmo público.
--
-- `restrictions` no perfil separa PROIBIÇÃO de orientação. Misturadas em
-- "diretrizes", o modelo dava o mesmo peso às duas — e "nunca prometa retorno
-- garantido" precisa ser lido como limite duro, não como sugestão de estilo.

ALTER TABLE "marketing_profiles"
  ADD COLUMN IF NOT EXISTS "restrictions" TEXT;

DO $$ BEGIN
  CREATE TYPE "MarketingCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "marketing_campaign_briefs" (
  "id"                   TEXT PRIMARY KEY,
  "organization_id"      TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "objective"            TEXT NOT NULL,
  "target_audience"      TEXT,
  "offer"                TEXT,
  "key_message"          TEXT,
  "restrictions"         TEXT,
  "ad_ids"               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "monthly_budget_cents" INTEGER,
  "status"               "MarketingCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
  "starts_at"            TIMESTAMP(3),
  "ends_at"              TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketing_campaign_briefs_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_campaign_brief_org_status"
  ON "marketing_campaign_briefs" ("organization_id", "status");
