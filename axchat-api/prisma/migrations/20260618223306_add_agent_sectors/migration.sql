-- CreateTable
CREATE TABLE "agent_sectors" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sector_agents" (
    "sector_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,

    CONSTRAINT "agent_sector_agents_pkey" PRIMARY KEY ("sector_id","agent_id")
);

-- CreateIndex
CREATE INDEX "idx_agent_sector_org_order" ON "agent_sectors"("organization_id", "order");

-- AddForeignKey
ALTER TABLE "agent_sectors" ADD CONSTRAINT "agent_sectors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sector_agents" ADD CONSTRAINT "agent_sector_agents_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "agent_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sector_agents" ADD CONSTRAINT "agent_sector_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
