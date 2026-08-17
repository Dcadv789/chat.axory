-- Estratégia do período no perfil de marketing.
--
-- O perfil já tinha "diretrizes", mas diretriz é LIMITE ("não prometa retorno
-- garantido"). Não havia onde escrever a DIREÇÃO ("neste trimestre o foco é
-- BPO para escritórios contábeis"). A crew então sabia o que não fazer e
-- escolhia sozinha o que fazer — pelo desempenho do mês anterior, que é o pior
-- conselheiro quando a empresa está mudando de rumo.
--
-- Coluna opcional: nenhuma organização existente muda de comportamento.

ALTER TABLE "marketing_profiles"
  ADD COLUMN IF NOT EXISTS "strategy" TEXT;
