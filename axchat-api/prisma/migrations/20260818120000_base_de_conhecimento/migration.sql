-- Base de conhecimento da empresa, por tenant.
--
-- Até aqui a IA sabia da empresa o que coubesse em UM campo de texto livre
-- (`organizations.ai_business_notes`) — regra de entrega, horário e política de
-- reembolso misturados no mesmo parágrafo. Texto solto não tem precedência:
-- quando o mesmo assunto aparece duas vezes, o modelo escolhe. E os 363 agentes
-- que falam com o cliente tinham esse único campo, enquanto a crew de marketing
-- já tinha sete campos estruturados.
--
-- Três níveis, todos isolados por organização:
--   company_knowledge   — vale pra todos os agentes do tenant
--   agent_sectors.knowledge — vale só pro departamento
--   knowledge_documents — o que nenhum formulário prevê

CREATE TABLE IF NOT EXISTS "company_knowledge" (
  "id"              TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL UNIQUE,
  "what_we_do"      TEXT,
  "products"        TEXT,
  "target_audience" TEXT,
  "differentials"   TEXT,
  "tone_of_voice"   TEXT,
  "guidelines"      TEXT,
  "restrictions"    TEXT,
  "service_hours"   TEXT,
  "faq"             TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_knowledge_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

ALTER TABLE "agent_sectors"
  ADD COLUMN IF NOT EXISTS "knowledge" TEXT;

CREATE TABLE IF NOT EXISTS "knowledge_documents" (
  "id"              TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "summary"         TEXT,
  "content"         TEXT NOT NULL,
  "sector_id"       TEXT,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_documents_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "knowledge_documents_sector_fk"
    FOREIGN KEY ("sector_id") REFERENCES "agent_sectors"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_knowledge_doc_org_active"
  ON "knowledge_documents" ("organization_id", "is_active");

-- Aproveita o que já existe: quem preencheu `ai_business_notes` não perde nada
-- e não precisa redigitar. O campo antigo continua sendo injetado no prompt
-- durante a transição.
INSERT INTO "company_knowledge" ("id", "organization_id", "guidelines", "updated_at")
SELECT gen_random_uuid()::text, o."id", o."ai_business_notes", now()
  FROM "organizations" o
 WHERE o."ai_business_notes" IS NOT NULL
   AND btrim(o."ai_business_notes") <> ''
   AND NOT EXISTS (
     SELECT 1 FROM "company_knowledge" c WHERE c."organization_id" = o."id"
   );
