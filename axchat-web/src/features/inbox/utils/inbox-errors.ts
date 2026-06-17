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
