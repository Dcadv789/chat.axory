-- Tabela do RAG. O código já chamava a busca há tempos, mas a tabela nunca
-- existiu (a migration citada num comentário nunca foi criada) — então toda
-- busca falhava e o erro era engolido por um logger.warn. A camada de memória
-- longa estava documentada como ativa e nunca rodou.
--
-- Sem pgvector: a extensão não está disponível nesta instalação do Postgres
-- (verificado em pg_available_extensions) e trocar a imagem afetaria o banco
-- compartilhado com o Axdeal. O embedding vai como double precision[] e a
-- similaridade de cosseno é calculada na aplicação, após filtrar por
-- agente/contato — o que reduz o conjunto a dezenas de vetores.
CREATE TABLE "ai_vector_entries" (
  "id"              TEXT NOT NULL,
  "owner_type"      TEXT NOT NULL,
  "owner_id"        TEXT NOT NULL,
  "conversation_id" TEXT,
  "agent_id"        TEXT,
  "contact_id"      TEXT,
  "content"         TEXT NOT NULL,
  "embedding"       DOUBLE PRECISION[] NOT NULL,
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_vector_entries_pkey" PRIMARY KEY ("id")
);

-- Índices dos predicados de escopo: são eles que mantêm barato o conjunto que
-- vai para o cálculo de similaridade.
CREATE INDEX "idx_vector_agent_contact" ON "ai_vector_entries" ("agent_id", "contact_id");
CREATE INDEX "idx_vector_conversation"  ON "ai_vector_entries" ("conversation_id");
CREATE INDEX "idx_vector_owner"         ON "ai_vector_entries" ("owner_type", "owner_id");
