-- Legenda do post (nome legível) no snapshot de métricas
ALTER TABLE "marketing_media_metrics"
  ADD COLUMN "caption" TEXT;
