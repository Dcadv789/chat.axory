-- Frente do canal: qual equipe de IA atende naquele canal.
--
-- Antes o roteador derivava a frente do setor do `default_orchestrator_id`.
-- Canal sem orquestrador virava ATENDIMENTO em silêncio (5 dos 9 canais da
-- Axory Capital Group estavam assim) e trocar o orquestrador padrão mudava a
-- frente sem ninguém pedir. Agora o canal declara.
--
-- OPERACAO é a frente interna: agentes que rodam a empresa por dentro e nunca
-- são candidatos a conversa de cliente.

ALTER TYPE "AiAgentSector" ADD VALUE IF NOT EXISTS 'OPERACAO' BEFORE 'PESSOAL';

ALTER TABLE "channels"
  ADD COLUMN IF NOT EXISTS "sector" "AiAgentSector" NOT NULL DEFAULT 'ATENDIMENTO';

-- Backfill com a MESMA regra que o roteador usava, pra nenhum canal em
-- produção mudar de comportamento no deploy. Canal sem orquestrador continua
-- ATENDIMENTO, que era o fallback anterior.
UPDATE "channels" c
   SET "sector" = a."sector"
  FROM "ai_agents" a
 WHERE c."default_orchestrator_id" = a."id";
