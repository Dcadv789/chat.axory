-- Verba de mídia por mês. Antes existia só um valor único no marketing_profiles,
-- que obrigava a redigitar todo mês e fazia o pacing de meses passados ser
-- comparado com a verba de HOJE.
CREATE TABLE "marketing_monthly_budgets" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "year"            INTEGER NOT NULL,
  "month"           INTEGER NOT NULL,
  "amount_cents"    INTEGER NOT NULL,
  "note"            TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketing_monthly_budgets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_marketing_budget_month"
  ON "marketing_monthly_budgets" ("organization_id", "year", "month");

CREATE INDEX "idx_marketing_budget_lookup"
  ON "marketing_monthly_budgets" ("organization_id", "year", "month");

ALTER TABLE "marketing_monthly_budgets"
  ADD CONSTRAINT "marketing_monthly_budgets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: quem já tinha verba configurada ganha o mês CORRENTE como primeiro
-- registro explícito. Daí pra frente a herança cuida dos meses seguintes, e os
-- meses anteriores continuam caindo no valor legado do perfil (que segue no
-- banco justamente pra isso).
INSERT INTO "marketing_monthly_budgets" (
  "id", "organization_id", "year", "month", "amount_cents", "note", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  p."organization_id",
  EXTRACT(YEAR FROM now())::int,
  EXTRACT(MONTH FROM now())::int,
  p."monthly_ad_budget_cents",
  'Migrado da verba mensal única',
  now(),
  now()
FROM "marketing_profiles" p
WHERE p."monthly_ad_budget_cents" IS NOT NULL
  AND p."monthly_ad_budget_cents" > 0;
