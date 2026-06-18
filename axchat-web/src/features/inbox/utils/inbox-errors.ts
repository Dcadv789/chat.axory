import type { Message } from '../services/inbox.service';

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
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length > 10) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return phone;
}

/**
 * Verifica se a janela de 24h do WhatsApp Oficial expirou.
 * Só se aplica a canais WHATSAPP_OFFICIAL.
 * A contagem começa da última mensagem INBOUND (do cliente).
 */
export function getEngagementWindowStatus(
  channelType: string,
  messages: Message[],
): { expired: boolean; ageLabel: string | null } {
  if (channelType !== 'WHATSAPP_OFFICIAL' || messages.length === 0) {
    return { expired: false, ageLabel: null };
  }

  const lastInbound = [...messages].reverse().find((m) => m.direction === 'INBOUND');
  if (!lastInbound) return { expired: false, ageLabel: null };

  const ageMs = Date.now() - new Date(lastInbound.createdAt).getTime();
  const ageHours = ageMs / (60 * 60 * 1000);
  if (ageHours < 24) return { expired: false, ageLabel: null };

  const ageLabel =
    ageHours < 48
      ? `${Math.floor(ageHours)}h`
      : `${Math.floor(ageHours / 24)} dias`;

  return { expired: true, ageLabel };
}
