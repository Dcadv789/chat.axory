/**
 * Utilitários compartilhados de leitura do Meta Ads — para que o painel do dono
 * (marketing-ads.service) e a captura da crew (captureMetaAdsMetrics) contem
 * conversões e datas EXATAMENTE do mesmo jeito. Divergência aqui faz o número do
 * painel não bater com o que a IA registra e usa pra decidir verba.
 */

/**
 * Tipos de `action_type` que contam como CONVERSÃO (match EXATO, não substring).
 *
 * Por que match exato e não regex de prefixo: a Meta devolve `actions` com tipos
 * que se SOBREPÕEM. Uma mesma compra aparece como `purchase` (total unificado já
 * deduplicado), `offsite_conversion.fb_pixel_purchase` e `onsite_conversion.purchase`
 * (recortes por origem). Somar tudo — como fazia o filtro antigo com
 * `.../onsite_conversion/` — conta a mesma conversão 2–3× e derruba o CPA.
 *
 * Aqui contamos só os tipos UNIFICADOS (que já são o total sem duplicar) + a
 * conversa de mensagens iniciada, que não tem equivalente unificado e é a
 * conversão principal de quem vende por WhatsApp/DM.
 */
export const CONVERSION_ACTION_TYPES: ReadonlySet<string> = new Set([
  'lead',
  'purchase',
  'complete_registration',
  'submit_application',
  'subscribe',
  'contact',
  'schedule',
  'start_trial',
  'onsite_conversion.messaging_conversation_started_7d',
]);

/**
 * Soma as conversões de um array `actions` do Meta, sem dupla contagem.
 * Retorna `null` quando não há nenhuma ação de conversão (pra distinguir de zero).
 */
export function countConversions(actions: unknown): number | null {
  if (!Array.isArray(actions)) return null;
  let total = 0;
  let matched = false;
  for (const a of actions) {
    const type = (a as { action_type?: unknown })?.action_type;
    if (typeof type === 'string' && CONVERSION_ACTION_TYPES.has(type)) {
      total += Number((a as { value?: unknown }).value) || 0;
      matched = true;
    }
  }
  return matched ? total : null;
}

/** Fuso de Brasília (UTC-3, sem horário de verão desde 2019). */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * "Agora" com a parede do relógio de Brasília: o Date retornado, lido via
 * getUTC*, dá o ano/mês/dia/hora BRT. Use pra decidir "que mês/dia é hoje".
 */
export function brtNow(): Date {
  return new Date(Date.now() - BRT_OFFSET_MS);
}

/**
 * Data YYYY-MM-DD (parede BRT) de um instante — default: agora. Usado pra montar
 * o `time_range` das capturas no MESMO fuso que o painel usa pro pacing.
 */
export function brtDateString(instant: Date = new Date()): string {
  return new Date(instant.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}
