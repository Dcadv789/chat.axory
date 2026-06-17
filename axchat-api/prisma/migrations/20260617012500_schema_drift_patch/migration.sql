-- Patch migration for schema drift found after importing the purchased code.
-- Some fields exist in schema.prisma but were not present in the database
-- after the original migration set was applied.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AI_TOOL_FAILURE';

ALTER TABLE "ai_agents"
  ADD COLUMN IF NOT EXISTS "department" TEXT,
  ADD COLUMN IF NOT EXISTS "operational_context" TEXT,
  ADD COLUMN IF NOT EXISTS "operational_context_updated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "parent_agent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "squad" TEXT;

ALTER TABLE "channels"
  ADD COLUMN IF NOT EXISTS "ai_enabled" BOOLEAN;

CREATE INDEX IF NOT EXISTS "idx_ai_agent_parent"
  ON "ai_agents"("parent_agent_id");

CREATE INDEX IF NOT EXISTS "idx_ai_agent_org_dept"
  ON "ai_agents"("organization_id", "department");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_revoked_by_fkey'
  ) THEN
    ALTER TABLE "messages" DROP CONSTRAINT "messages_revoked_by_fkey";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_revoked_by_fkey'
  ) THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_revoked_by_fkey"
      FOREIGN KEY ("revoked_by")
      REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_agents_parent_agent_id_fkey'
  ) THEN
    ALTER TABLE "ai_agents"
      ADD CONSTRAINT "ai_agents_parent_agent_id_fkey"
      FOREIGN KEY ("parent_agent_id")
      REFERENCES "ai_agents"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
