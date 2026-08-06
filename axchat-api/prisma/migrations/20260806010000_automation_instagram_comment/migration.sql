-- Gatilho de automação para comentário do Instagram.
--
-- Postgres não permite ADD VALUE dentro de transação em versões antigas; o
-- Prisma roda cada migration numa, então usamos IF NOT EXISTS pra ser
-- idempotente e evitar falha em reaplicação.
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'INSTAGRAM_COMMENT';
