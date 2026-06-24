-- CreateEnum
CREATE TYPE "AiAgentSector" AS ENUM ('ATENDIMENTO', 'MARKETING');

-- AlterTable
ALTER TABLE "ai_agents" ADD COLUMN     "sector" "AiAgentSector" NOT NULL DEFAULT 'ATENDIMENTO';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "marketing_enabled" BOOLEAN NOT NULL DEFAULT false;
