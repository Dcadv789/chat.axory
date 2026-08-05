import { api } from '@/lib/api';

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface BusinessHoursDay {
  enabled: boolean;
  windows?: Array<[string, string]>; // ["09:00","18:00"]
}
export type BusinessHoursConfig = Partial<Record<Weekday, BusinessHoursDay>>;

export interface WatchdogConfig {
  delayBotMin?: number;
  delayPendingMin?: number;
  delayHumanIdleMin?: number;
  maxAttempts?: number;
}

export const DEFAULT_WATCHDOG_CONFIG: Required<WatchdogConfig> = {
  delayBotMin: 15,
  delayPendingMin: 15,
  delayHumanIdleMin: 60,
  maxAttempts: 3,
};

export interface OrganizationAiSettings {
  id: string;
  name: string;
  aiEnabled: boolean;
  aiTimezone: string;
  aiBusinessHours: BusinessHoursConfig | null;
  aiOutOfHoursMessage: string | null;
  aiBusinessNotes: string | null;
  aiAutoDisableOnHuman: boolean;
  /** Quando true, o nome de quem enviou (atendente ou agente de IA) é
   *  prefixado no texto entregue ao cliente — "*Nome:*\ntexto". */
  signMessagesWithSenderName: boolean;
  /** Trava de roteamento por setor: quando true, o orquestrador joga toda
   *  conversa que precisa de humano no setor padrão. */
  routeAllToDefaultSector: boolean;
  aiMonthlyTokenCap: number | null;
  /** Quantas mensagens anteriores da conversa o agente lê (5 a 200). */
  aiHistoryWindow?: number;
  watchdogEnabled: boolean;
  watchdogBusinessHours: BusinessHoursConfig | null;
  watchdogConfig: WatchdogConfig | null;
  /** Lista de domínios permitidos em URLs que a IA pode mandar pro cliente.
   *  null/[] = permissivo (não bloqueia, só warning). Match por sufixo. */
  allowedUrlDomains: string[] | null;
  /** true = IA AxChat: roda no motor da AxChat e o cliente não configura chave
   *  nenhuma. false = IA própria: ele traz a chave/modelo dele. Só o Super
   *  Admin muda isso. */
  axchatAiEnabled?: boolean;
  /** true se há uma chave DeepSeek configurada (a chave nunca é exposta). */
  deepseekApiKeySet?: boolean;
  /** Preview mascarado da chave DeepSeek (ex: ••••••••1234) ou null. */
  deepseekApiKeyPreview?: string | null;
}

export interface UpdateAiSettingsInput {
  aiEnabled?: boolean;
  aiTimezone?: string;
  aiBusinessHours?: BusinessHoursConfig | null;
  aiOutOfHoursMessage?: string;
  aiBusinessNotes?: string | null;
  aiAutoDisableOnHuman?: boolean;
  signMessagesWithSenderName?: boolean;
  routeAllToDefaultSector?: boolean;
  aiMonthlyTokenCap?: number | null;
  aiHistoryWindow?: number;
  watchdogEnabled?: boolean;
  watchdogBusinessHours?: BusinessHoursConfig | null;
  watchdogConfig?: WatchdogConfig | null;
  allowedUrlDomains?: string[] | null;
  /** Enviar string para definir a chave DeepSeek; null/'' para limpar. */
  deepseekApiKey?: string | null;
}

export const aiSettingsService = {
  async get(): Promise<OrganizationAiSettings> {
    const { data } = await api.get('/organizations/current');
    return data.data ?? data;
  },

  async update(input: UpdateAiSettingsInput): Promise<OrganizationAiSettings> {
    const { data } = await api.patch('/organizations/current', input);
    return data.data ?? data;
  },
};

export const WEEKDAYS: Array<{ key: Weekday; label: string }> = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  monday: { enabled: true, windows: [['09:00', '18:00']] },
  tuesday: { enabled: true, windows: [['09:00', '18:00']] },
  wednesday: { enabled: true, windows: [['09:00', '18:00']] },
  thursday: { enabled: true, windows: [['09:00', '18:00']] },
  friday: { enabled: true, windows: [['09:00', '18:00']] },
  saturday: { enabled: false, windows: [] },
  sunday: { enabled: false, windows: [] },
};
