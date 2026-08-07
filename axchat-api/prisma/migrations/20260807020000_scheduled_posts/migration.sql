-- Agendamento de posts do painel de Marketing.
--
-- O agendamento vive no banco, e não como job atrasado na fila: job atrasado
-- some se o Redis for limpo, e não dá pra listar num calendário. Aqui a fila é
-- só o gatilho (um tick por minuto) e a verdade é a tabela.

CREATE TYPE "ScheduledPostNetwork" AS ENUM ('INSTAGRAM', 'THREADS');

CREATE TYPE "ScheduledPostStatus" AS ENUM (
  'PENDING',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'CANCELED'
);

CREATE TABLE "scheduled_posts" (
  "id"                 TEXT NOT NULL,
  "organization_id"    TEXT NOT NULL,
  "channel_id"         TEXT,
  "network"            "ScheduledPostNetwork" NOT NULL,
  "caption"            TEXT,
  "image_url"          TEXT,
  "video_url"          TEXT,
  "carousel_urls"      TEXT[],
  "scheduled_for"      TIMESTAMP(3) NOT NULL,
  "status"             "ScheduledPostStatus" NOT NULL DEFAULT 'PENDING',
  "published_at"       TIMESTAMP(3),
  "published_media_id" TEXT,
  "last_error"         TEXT,
  "attempts"           INTEGER NOT NULL DEFAULT 0,
  "created_by_id"      TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scheduled_posts_pkey" PRIMARY KEY ("id")
);

-- Consulta da tela: os agendamentos de uma empresa num intervalo de datas.
CREATE INDEX "idx_sched_post_org_time"
  ON "scheduled_posts" ("organization_id", "scheduled_for");

-- Consulta do tick: o que já venceu, sem filtrar empresa.
CREATE INDEX "idx_sched_post_due"
  ON "scheduled_posts" ("status", "scheduled_for");

ALTER TABLE "scheduled_posts"
  ADD CONSTRAINT "scheduled_posts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
