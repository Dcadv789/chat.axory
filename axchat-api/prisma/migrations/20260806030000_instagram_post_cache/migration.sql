-- Teto de posts por sincronização. NULL = sem limite (padrão): traz o perfil
-- inteiro. Cada tenant ajusta pelo painel de Marketing.
ALTER TABLE "marketing_profiles" ADD COLUMN "posts_sync_limit" INTEGER;

-- Cópia local dos posts do Instagram. Antes a listagem vinha direto da Graph
-- API a cada abertura de tela: lenta, gastava cota e a numeração cronológica
-- mudava conforme a janela de paginação.
CREATE TABLE "instagram_post_cache" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "media_id" TEXT NOT NULL,
    "caption" TEXT,
    "media_type" TEXT,
    "thumbnail_url" TEXT,
    "permalink" TEXT,
    "timestamp" TIMESTAMP(3),
    "likes" INTEGER,
    "comments" INTEGER,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_post_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_ig_post_cache" ON "instagram_post_cache"("organization_id", "media_id");

CREATE INDEX "idx_ig_post_cache_time" ON "instagram_post_cache"("organization_id", "timestamp");

ALTER TABLE "instagram_post_cache"
    ADD CONSTRAINT "instagram_post_cache_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
