-- Departamento passa a ser UM conceito: a tabela `agent_sectors`.
--
-- Antes havia três classificações concorrentes e nenhuma delas mandava em
-- nada: `department` (texto livre), `squad` (texto livre, cópia quase exata do
-- department — CONTABIL 124 vs 127, JURIDICO 106 vs 109) e a tabela
-- `agent_sectors`, criada mas com ZERO vínculos em produção.
--
-- Agora a tabela é a fonte da verdade. Ela já tinha nome, cor, ícone e ordem —
-- tudo que texto livre não tem, e o motivo de "MARKETING" e "Marketing"
-- virarem dois departamentos diferentes.
--
-- `department` sobrevive a esta migração de propósito: derrubar coluna lida
-- por código que ainda está no ar quebra o app entre o migrate e o deploy.
-- Ela sai numa migração seguinte, quando nada mais a ler.

-- 1) Um departamento por (organização, department) que exista hoje.
INSERT INTO "agent_sectors" ("id", "organization_id", "name", "description", "color", "order", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  d."organization_id",
  d."department",
  'Migrado do campo department',
  CASE d."department"
    WHEN 'VENDAS'        THEN '#10b981'
    WHEN 'SUPORTE'       THEN '#3b82f6'
    WHEN 'CS'            THEN '#8b5cf6'
    WHEN 'CONTABIL'      THEN '#f59e0b'
    WHEN 'JURIDICO'      THEN '#f43f5e'
    WHEN 'FINANCEIRO'    THEN '#14b8a6'
    WHEN 'OPERACOES'     THEN '#06b6d4'
    WHEN 'TECNOLOGIA'    THEN '#6366f1'
    WHEN 'MARKETING'     THEN '#ec4899'
    WHEN 'PESSOAL'       THEN '#a855f7'
    ELSE '#a1a1aa'
  END,
  0, now(), now()
FROM (
  SELECT DISTINCT "organization_id", "department"
    FROM "ai_agents"
   WHERE "deleted_at" IS NULL
     AND "department" IS NOT NULL
     AND btrim("department") <> ''
) d
WHERE NOT EXISTS (
  SELECT 1 FROM "agent_sectors" s
   WHERE s."organization_id" = d."organization_id" AND s."name" = d."department"
);

-- 2) "Geral" em toda organização. É a resposta pra "por que não existe setor
--    geral?": o model Department humano já criava um por padrão, este não.
INSERT INTO "agent_sectors" ("id", "organization_id", "name", "description", "color", "order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, o."id", 'Geral', 'Departamento padrão', '#a1a1aa', 999, now(), now()
  FROM "organizations" o
 WHERE NOT EXISTS (
   SELECT 1 FROM "agent_sectors" s WHERE s."organization_id" = o."id" AND s."name" = 'Geral'
 );

-- 3) Vincula cada agente ao departamento com o nome que ele já carregava.
INSERT INTO "agent_sector_agents" ("sector_id", "agent_id")
SELECT s."id", a."id"
  FROM "ai_agents" a
  JOIN "agent_sectors" s
    ON s."organization_id" = a."organization_id" AND s."name" = a."department"
 WHERE a."deleted_at" IS NULL
ON CONFLICT DO NOTHING;

-- 4) Quem não tinha departamento nenhum cai no Geral, em vez de ficar no balde
--    cinza "Sem setor" que fazia a tela parecer quebrada.
INSERT INTO "agent_sector_agents" ("sector_id", "agent_id")
SELECT s."id", a."id"
  FROM "ai_agents" a
  JOIN "agent_sectors" s
    ON s."organization_id" = a."organization_id" AND s."name" = 'Geral'
 WHERE a."deleted_at" IS NULL
   AND (a."department" IS NULL OR btrim(a."department") = '')
ON CONFLICT DO NOTHING;

-- 5) `squad` morre. Era cópia do department e nenhuma linha de código lia.
ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "squad";
