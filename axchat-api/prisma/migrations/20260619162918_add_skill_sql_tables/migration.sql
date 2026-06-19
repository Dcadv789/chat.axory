-- AlterTable
ALTER TABLE "ai_skill_versions" ADD COLUMN     "sql_tables" JSONB;

-- AlterTable
ALTER TABLE "ai_skills" ADD COLUMN     "sql_tables" JSONB;
