-- Motor de automações por empresa.
--
-- Antes só existia o AUTOMATIONS_ENABLED global (env), que liga ou desliga a
-- plataforma inteira. Ele continua valendo como chave de emergência, mas quem
-- decide se as regras de uma empresa rodam passa a ser o dono dela.
--
-- Nasce desligado de propósito: automação que dispara sem ninguém ter ligado
-- publica coisa no Instagram do cliente sem aviso.
ALTER TABLE "organizations"
  ADD COLUMN "automations_enabled" BOOLEAN NOT NULL DEFAULT false;
