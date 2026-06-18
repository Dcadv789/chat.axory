-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "default_orchestrator_id" TEXT;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_default_orchestrator_id_fkey" FOREIGN KEY ("default_orchestrator_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
