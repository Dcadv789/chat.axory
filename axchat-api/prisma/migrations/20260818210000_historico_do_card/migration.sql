-- Histórico de movimentação do card.
--
-- Não existia nada: o card guardava só o estado ATUAL. Sem histórico não dá
-- pra responder "quanto tempo o lead fica em Proposta" nem "onde o funil
-- trava" — que são as perguntas que fazem um CRM valer alguma coisa.
--
-- `origem` existe com três valores porque agora IA e automação também mexem no
-- funil. Um histórico que só registra pessoa mentiria por omissão: o card
-- teria andado sozinho.

DO $$ BEGIN
  CREATE TYPE "CardActivityTipo" AS ENUM
    ('CRIADO','MOVIDO','GANHO','PERDIDO','REABERTO','VALOR_ALTERADO','ATRIBUIDO','COMENTARIO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CardActivityOrigem" AS ENUM ('HUMANO','AUTOMACAO','IA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "card_activities" (
  "id"            TEXT PRIMARY KEY,
  "card_id"       TEXT NOT NULL,
  "tipo"          "CardActivityTipo"   NOT NULL,
  "origem"        "CardActivityOrigem" NOT NULL,
  "user_id"       TEXT,
  "agent_id"      TEXT,
  "automation_id" TEXT,
  "from_stage_id" TEXT,
  "to_stage_id"   TEXT,
  "descricao"     TEXT,
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "card_activities_card_fk"
    FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_card_activity_card"
  ON "card_activities" ("card_id", "created_at");
