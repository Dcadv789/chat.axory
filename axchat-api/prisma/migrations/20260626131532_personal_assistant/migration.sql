-- CreateEnum
CREATE TYPE "PersonalTaskStatus" AS ENUM ('TODO', 'DOING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PersonalReminderStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PersonalEventSource" AS ENUM ('NATIVE', 'GOOGLE');

-- AlterEnum
ALTER TYPE "AiAgentSector" ADD VALUE 'PESSOAL';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "assistant_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "personal_assistant_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "channel_id" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "google_calendar_connected" BOOLEAN NOT NULL DEFAULT false,
    "daily_briefing_hour" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_assistant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "PersonalTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" INTEGER,
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_notes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_reminders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "status" "PersonalReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "task_id" TEXT,
    "event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_calendar_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "source" "PersonalEventSource" NOT NULL DEFAULT 'NATIVE',
    "google_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_assistant_configs_organization_id_user_id_key" ON "personal_assistant_configs"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_ptask_org_user_status" ON "personal_tasks"("organization_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "idx_ptask_user_due" ON "personal_tasks"("user_id", "due_at");

-- CreateIndex
CREATE INDEX "idx_pnote_org_user_time" ON "personal_notes"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_preminder_due" ON "personal_reminders"("status", "remind_at");

-- CreateIndex
CREATE INDEX "idx_preminder_org_user" ON "personal_reminders"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_pevent_org_user_start" ON "personal_calendar_events"("organization_id", "user_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "personal_calendar_events_user_id_google_event_id_key" ON "personal_calendar_events"("user_id", "google_event_id");

-- AddForeignKey
ALTER TABLE "personal_assistant_configs" ADD CONSTRAINT "personal_assistant_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_assistant_configs" ADD CONSTRAINT "personal_assistant_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_tasks" ADD CONSTRAINT "personal_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_tasks" ADD CONSTRAINT "personal_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_notes" ADD CONSTRAINT "personal_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_notes" ADD CONSTRAINT "personal_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_reminders" ADD CONSTRAINT "personal_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_reminders" ADD CONSTRAINT "personal_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_reminders" ADD CONSTRAINT "personal_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "personal_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_reminders" ADD CONSTRAINT "personal_reminders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "personal_calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_calendar_events" ADD CONSTRAINT "personal_calendar_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_calendar_events" ADD CONSTRAINT "personal_calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
