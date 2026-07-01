-- Snapshot temporal de métricas por campanha de anúncio (Meta Ads)
CREATE TABLE "marketing_ad_metrics" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "run_id" TEXT,
  "campaign_id" TEXT NOT NULL,
  "campaign_name" TEXT,
  "objective" TEXT,
  "status" TEXT,
  "spend" DOUBLE PRECISION,
  "impressions" INTEGER,
  "reach" INTEGER,
  "clicks" INTEGER,
  "ctr" DOUBLE PRECISION,
  "cpc" DOUBLE PRECISION,
  "cpm" DOUBLE PRECISION,
  "conversions" INTEGER,
  "currency" TEXT,
  "raw" JSONB,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_ad_metrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_mkt_admetric_org_campaign_time"
  ON "marketing_ad_metrics" ("organization_id", "campaign_id", "captured_at");

CREATE INDEX "idx_mkt_admetric_org_time"
  ON "marketing_ad_metrics" ("organization_id", "captured_at");

ALTER TABLE "marketing_ad_metrics"
  ADD CONSTRAINT "marketing_ad_metrics_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
