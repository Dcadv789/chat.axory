-- Janela de histórico que o agente lê, agora configurável por organização.
-- Era uma constante de 30 no código (MAX_RECENT_MESSAGES), o que deixava a IA
-- cega para o começo de qualquer conversa mais longa — e só o WhatsApp Official
-- rotaciona conversa, então Telegram/Instagram acumulam indefinidamente.
--
-- Default 50: a operação é de atendimento rápido, então janela curta basta e
-- segura custo e latência. Quem precisar de mais ajusta na tela.
ALTER TABLE "organizations"
  ADD COLUMN "ai_history_window" INTEGER NOT NULL DEFAULT 50;
