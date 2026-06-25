-- CreateTable
CREATE TABLE "agent_crons" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "cron_expression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "last_run_id" TEXT,
    "last_status" TEXT,
    "last_error" TEXT,
    "next_run_at" TIMESTAMP(3),
    "conversation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "agent_crons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_agent_cron_org" ON "agent_crons"("organization_id");

-- CreateIndex
CREATE INDEX "idx_agent_cron_agent" ON "agent_crons"("agent_id");

-- CreateIndex
CREATE INDEX "idx_agent_cron_due" ON "agent_crons"("is_active", "next_run_at");

-- AddForeignKey
ALTER TABLE "agent_crons" ADD CONSTRAINT "agent_crons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_crons" ADD CONSTRAINT "agent_crons_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
