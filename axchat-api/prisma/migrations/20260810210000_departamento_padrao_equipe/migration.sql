-- O departamento padrão deixa de se chamar "Geral".
--
-- Dois motivos. O primeiro é que "Geral" não diz nada: é balde, não
-- departamento. O segundo é pior — o model `Department` (fila HUMANA pra
-- transferir conversa) já cria um "Geral" por padrão, então o produto tinha
-- duas coisas com o mesmo nome, em tabelas diferentes, significando coisas
-- diferentes. É a confusão "setor vs departamento" nascendo de novo.
--
-- Só mexe em `agent_sectors`. O "Geral" da fila humana continua como está —
-- lá o nome faz sentido, é a fila padrão de atendimento.

UPDATE "agent_sectors"
   SET "name" = 'Equipe',
       "description" = 'Departamento padrão',
       "updated_at" = now()
 WHERE "name" = 'Geral'
   AND NOT EXISTS (
     SELECT 1 FROM "agent_sectors" outro
      WHERE outro."organization_id" = "agent_sectors"."organization_id"
        AND outro."name" = 'Equipe'
   );
