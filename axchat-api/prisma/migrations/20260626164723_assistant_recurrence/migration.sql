-- CreateEnum
CREATE TYPE "PersonalRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "personal_assistant_configs" ADD COLUMN     "evening_summary_hour" INTEGER,
ADD COLUMN     "last_evening_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "personal_reminders" ADD COLUMN     "recurrence" "PersonalRecurrence" NOT NULL DEFAULT 'NONE';
