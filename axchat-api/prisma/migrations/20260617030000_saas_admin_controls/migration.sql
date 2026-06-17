DO $$ BEGIN
  CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BillingStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXEMPT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "suspended_reason" TEXT,
ADD COLUMN IF NOT EXISTS "billing_status" "BillingStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN IF NOT EXISTS "billing_email" TEXT,
ADD COLUMN IF NOT EXISTS "billing_amount_cents" INTEGER,
ADD COLUMN IF NOT EXISTS "billing_currency" TEXT NOT NULL DEFAULT 'BRL',
ADD COLUMN IF NOT EXISTS "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS "billing_due_day" INTEGER,
ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "current_period_ends_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "super_admin_audit_logs" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT,
  "organization_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "super_admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_super_audit_actor" ON "super_admin_audit_logs"("actor_id");
CREATE INDEX IF NOT EXISTS "idx_super_audit_org" ON "super_admin_audit_logs"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_super_audit_created" ON "super_admin_audit_logs"("created_at");

DO $$ BEGIN
  ALTER TABLE "super_admin_audit_logs"
  ADD CONSTRAINT "super_admin_audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "super_admin_audit_logs"
  ADD CONSTRAINT "super_admin_audit_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
