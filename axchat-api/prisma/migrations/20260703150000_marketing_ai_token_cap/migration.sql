-- Cap de tokens de IA do marketing (separado da cota de atendimento).
ALTER TABLE "organizations"
  ADD COLUMN "ai_marketing_monthly_token_cap" INTEGER;
