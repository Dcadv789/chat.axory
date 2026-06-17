import { ChannelType } from '@prisma/client';

export function syncNotSupportedMessage(channelType: ChannelType | string): string {
  const type = String(channelType).toUpperCase();

  if (type === 'WHATSAPP_OFFICIAL') {
    return 'WhatsApp Oficial não aceita sincronização de mensagens antigas.';
  }

  if (type === 'TELEGRAM') {
    return 'Telegram não aceita sincronização de mensagens antigas.';
  }

  return `O canal ${type} não suporta sincronização de histórico.`;
}

export const HISTORY_SYNC_CHANNEL_TYPES = new Set<ChannelType>([
  'WHATSAPP_ZAPPFY',
  'INSTAGRAM',
]);
