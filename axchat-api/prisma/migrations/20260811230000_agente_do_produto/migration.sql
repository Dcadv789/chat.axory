-- Separa o agente que a Axory VENDE do agente que o cliente CRIA.
--
-- Até aqui os dois eram idênticos no banco, e nada impedia o cliente de
-- reescrever o prompt do Magnus por completo. Dois problemas nisso: ele quebra
-- o agente e a culpa vira do sistema; e quando melhoramos o texto no seed,
-- quem editou não recebe a melhoria — passa a existir uma versão por cliente
-- pra manter.
--
-- `additional_instructions` é a saída: o cliente ajusta o comportamento sem
-- destruir a base, e as melhorias continuam chegando.
--
-- BACKFILL: todo agente que existe hoje veio do provisionamento (seed) —
-- nenhum cliente criou agente ainda. Por isso todos entram como gerenciados.
-- Os criados daqui pra frente pela tela nascem `false`.

ALTER TABLE "ai_agents"
  ADD COLUMN IF NOT EXISTS "is_managed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "additional_instructions" TEXT;

UPDATE "ai_agents" SET "is_managed" = true WHERE "deleted_at" IS NULL;
