-- DeepSeek saiu do catálogo de motores: agora ele se configura como
-- "Personalizado (formato OpenAI)", informando a base-URL.
--
-- Os registros que já existiam com provider='deepseek' precisam continuar
-- funcionando. Convertemos pra 'custom' gravando a base-URL EXPLICITAMENTE —
-- antes ela vinha implícita do catálogo, e sem esse passo o motor ficaria sem
-- endereço e a IA desses clientes pararia.
--
-- Só mexe em quem está sem base-URL: se o cliente já apontou um endpoint
-- próprio, esse valor é preservado.
UPDATE "ai_model_providers"
SET
  "provider" = 'custom',
  "base_url" = COALESCE(NULLIF(btrim("base_url"), ''), 'https://api.deepseek.com'),
  "updated_at" = now()
WHERE "provider" = 'deepseek';
