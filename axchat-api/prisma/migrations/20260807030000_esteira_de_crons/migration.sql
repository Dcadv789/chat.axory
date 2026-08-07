-- Esteira entre crons de agentes.
--
-- Cada agente rodava no relógio dele e nenhum enxergava o trabalho do outro.
-- Com `next_cron_id`, terminar um disparo pode acionar o próximo, levando o
-- que o agente concluiu como contexto de entrada — é o que fecha o ciclo
-- medir → decidir → agir → medir.
ALTER TABLE "agent_crons" ADD COLUMN "next_cron_id" TEXT;

-- SET NULL: apagar um cron da esteira não pode derrubar o anterior junto.
ALTER TABLE "agent_crons"
  ADD CONSTRAINT "agent_crons_next_cron_id_fkey"
  FOREIGN KEY ("next_cron_id") REFERENCES "agent_crons"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_agent_cron_next" ON "agent_crons" ("next_cron_id");
