-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'COMPLETED', 'CANCELED', 'FAILED');
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "campaigns" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "channel_type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "message_type" TEXT NOT NULL DEFAULT 'TEXT',
  "content" JSONB NOT NULL DEFAULT '{}',
  "audience" JSONB NOT NULL DEFAULT '{}',
  "total" INTEGER NOT NULL DEFAULT 0,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "name" TEXT,
  "external_id" TEXT,
  "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "message_id" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_campaign_org_status" ON "campaigns" ("organization_id", "status");
CREATE INDEX "idx_camp_recipient_status" ON "campaign_recipients" ("campaign_id", "status");

-- ForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
