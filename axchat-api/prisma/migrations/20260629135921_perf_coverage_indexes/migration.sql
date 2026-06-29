-- Índices de cobertura (inbox/dashboard/unread).
-- NOTA: build não-concorrente trava ESCRITA na tabela durante a construção
-- (leitura continua). Em conversations é rápido; em messages pode levar mais
-- tempo se a tabela for grande. Alternativa prod-safe (rodar manualmente no
-- console do banco, fora do Prisma): CREATE INDEX CONCURRENTLY ...

-- DropIndex (prefixo do novo idx_conv_org_archived_lastmsg)
DROP INDEX IF EXISTS "idx_conv_org_archived";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_conv_org_archived_lastmsg" ON "conversations"("organization_id", "is_archived", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_conv_org_created" ON "conversations"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_msg_conv_dir_time" ON "messages"("conversation_id", "direction", "created_at");
