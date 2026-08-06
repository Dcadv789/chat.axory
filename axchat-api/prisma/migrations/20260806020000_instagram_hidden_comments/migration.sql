-- Comentários ocultos do Instagram.
--
-- A Graph API não devolve comentário oculto na listagem do post. Sem esta
-- tabela, ocultar um comentário o faz sumir da tela pra sempre — inclusive
-- quando foi sem querer — e não sobra jeito de reexibir pelo AxChat.
CREATE TABLE "instagram_hidden_comments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "media_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "hidden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden_by" TEXT,

    CONSTRAINT "instagram_hidden_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_ig_hidden_comment" ON "instagram_hidden_comments"("organization_id", "comment_id");

CREATE INDEX "idx_ig_hidden_media" ON "instagram_hidden_comments"("organization_id", "media_id");

ALTER TABLE "instagram_hidden_comments"
    ADD CONSTRAINT "instagram_hidden_comments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
