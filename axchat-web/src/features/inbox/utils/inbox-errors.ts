const HISTORY_SYNC_CHANNEL_TYPES = new Set(['WHATSAPP_ZAPPFY', 'INSTAGRAM']);

export function conversationSupportsSync(channelType: string): boolean {
  return HISTORY_SYNC_CHANNEL_TYPES.has(channelType.toUpperCase());
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const message = (err as { response?: { data?: { message?: unknown } } }).response?.data
      ?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * Formata número de telefone brasileiro para exibição amigável.
 * Aceita formatos: "5511953779696" → "+55 11 95377-9696"
 * "5511930303030" → "+55 11 93030-3030"
 * Se não conseguir formatar, retorna o original.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, '');
  // Brasileiro com código do país: 55 + DDD + número (10 ou 11 dígitos após o 55)
  if (digits.length === 13 && digits.startsWith('55')) {
    // 55 11 95377-9696
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    // 55 11 3030-3030
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  // Tenta formato internacional genérico
  if (digits.length > 10) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return phone;
}
