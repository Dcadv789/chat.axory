-- Conta de Instagram PADRÃO do marketing da empresa.
--
-- As credenciais de marketing eram uma tripla por organização e a última
-- conexão sobrescrevia as anteriores. O painel já ganhou um seletor por conta,
-- mas as skills dos agentes não têm canal no contexto — sem este campo elas
-- continuariam agindo sobre "a última conectada".
--
-- ON DELETE SET NULL: apagar o canal não pode derrubar o perfil de marketing;
-- o marketing só volta a usar os secrets da organização.
ALTER TABLE "marketing_profiles"
  ADD COLUMN "default_channel_id" TEXT;

ALTER TABLE "marketing_profiles"
  ADD CONSTRAINT "marketing_profiles_default_channel_id_fkey"
  FOREIGN KEY ("default_channel_id") REFERENCES "channels"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
