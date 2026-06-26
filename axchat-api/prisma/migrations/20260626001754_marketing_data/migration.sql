-- CreateEnum
CREATE TYPE "MarketingMediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "marketing_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "company_description" TEXT,
    "products" TEXT,
    "target_audience" TEXT,
    "tone_of_voice" TEXT,
    "guidelines" TEXT,
    "monthly_ad_budget_cents" INTEGER,
    "max_daily_budget_cents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "external_rules_skill" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_media_assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "MarketingMediaKind" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "bucket" TEXT,
    "mime_type" TEXT,
    "bytes" INTEGER,
    "source" TEXT,
    "prompt" TEXT,
    "agent_id" TEXT,
    "run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_analyses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "run_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "recommendations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_activities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "run_id" TEXT,
    "action" TEXT NOT NULL,
    "channel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "title" TEXT,
    "external_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_profiles_organization_id_key" ON "marketing_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "idx_mkt_asset_org_time" ON "marketing_media_assets"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_mkt_analysis_org_time" ON "marketing_analyses"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_mkt_analysis_org_kind" ON "marketing_analyses"("organization_id", "kind");

-- CreateIndex
CREATE INDEX "idx_mkt_activity_org_time" ON "marketing_activities"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_mkt_activity_org_action" ON "marketing_activities"("organization_id", "action");

-- AddForeignKey
ALTER TABLE "marketing_profiles" ADD CONSTRAINT "marketing_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_media_assets" ADD CONSTRAINT "marketing_media_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_analyses" ADD CONSTRAINT "marketing_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_activities" ADD CONSTRAINT "marketing_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
