-- AlterTable: campanha/origem no contato
ALTER TABLE "contacts" ADD COLUMN "campaign" TEXT;
ALTER TABLE "contacts" ADD COLUMN "source" TEXT;

-- Index p/ filtrar por campanha
CREATE INDEX "idx_contact_org_campaign" ON "contacts" ("organization_id", "campaign");
