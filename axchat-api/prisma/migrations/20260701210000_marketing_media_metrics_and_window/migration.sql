-- Janela de análise configurável no perfil de marketing
ALTER TABLE "marketing_profiles"
  ADD COLUMN "analysis_window" TEXT NOT NULL DEFAULT 'LAST_MONTH';

-- Snapshot temporal de métricas por post do Instagram
CREATE TABLE "marketing_media_metrics" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "run_id" TEXT,
  "media_id" TEXT NOT NULL,
  "media_type" TEXT,
  "permalink" TEXT,
  "reach" INTEGER,
  "likes" INTEGER,
  "comments" INTEGER,
  "saved" INTEGER,
  "shares" INTEGER,
  "total_interactions" INTEGER,
  "views" INTEGER,
  "raw" JSONB,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_media_metrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_mkt_metric_org_media_time"
  ON "marketing_media_metrics" ("organization_id", "media_id", "captured_at");

CREATE INDEX "idx_mkt_metric_org_time"
  ON "marketing_media_metrics" ("organization_id", "captured_at");

ALTER TABLE "marketing_media_metrics"
  ADD CONSTRAINT "marketing_media_metrics_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
