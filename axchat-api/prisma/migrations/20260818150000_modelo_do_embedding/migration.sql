-- Guarda qual modelo gerou cada vetor da busca semântica.
--
-- O provedor de embedding passou a ser configurável (slot próprio no Motor de
-- IA), porque Anthropic e DeepSeek não têm esse endpoint e quem roda Claude no
-- texto precisa apontar pra OpenAI ou Google.
--
-- Só que vetores de modelos diferentes NÃO são comparáveis: o
-- `text-embedding-3-small` tem 1536 dimensões e o `text-embedding-004` do
-- Google tem 768. Sem esta coluna, trocar o provedor faria a busca devolver
-- lixo EM SILÊNCIO — o cosseno entre vetores de espaços diferentes é um
-- número, só não significa nada. Com ela, a busca ignora o que veio de outro
-- modelo: o resultado fica menor até o backfill rodar, em vez de errado.
--
-- Os vetores que já existem ficam com NULL e são tratados como do modelo
-- padrão anterior — era o único em uso até agora.

ALTER TABLE "ai_vector_entries"
  ADD COLUMN IF NOT EXISTS "embedding_model" TEXT;

UPDATE "ai_vector_entries"
   SET "embedding_model" = 'text-embedding-3-small'
 WHERE "embedding_model" IS NULL;
