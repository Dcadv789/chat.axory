-- CreateTable
CREATE TABLE "organization_secrets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_org_secret_org" ON "organization_secrets"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_secrets_organization_id_key_key" ON "organization_secrets"("organization_id", "key");

-- AddForeignKey
ALTER TABLE "organization_secrets" ADD CONSTRAINT "organization_secrets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
