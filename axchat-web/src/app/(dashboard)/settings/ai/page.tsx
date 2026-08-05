'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, ShieldAlert, Link2, KeyRound, Cpu, Layers, RefreshCw, Loader2, Pencil, CheckCircle2, XCircle, Bot, Hand, Contact, CalendarClock, Gauge, MoonStar, BookOpen, ShieldCheck, SlidersHorizontal, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  aiSettingsService,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_WATCHDOG_CONFIG,
  WEEKDAYS,
  type BusinessHoursConfig,
  type WatchdogConfig,
  type Weekday,
} from '@/features/ai-agents/services/ai-settings.service';
import {
  aiModelProvidersService,
  type AiModelProvider,
} from '@/features/settings/services/ai-model-providers.service';
import {
  agentSectorsService,
  type AgentSector,
} from '@/features/ai-agents/services/agent-sectors.service';
import { channelsService, type Channel } from '@/features/channels/services/channels.service';

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Bahia',
  'America/Fortaleza',
  'America/Recife',
];

export default function SettingsAiPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => aiSettingsService.get(),
  });

  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiTimezone, setAiTimezone] = useState('America/Sao_Paulo');
  const [hours, setHours] = useState<BusinessHoursConfig>(DEFAULT_BUSINESS_HOURS);
  // 24/7: representado no banco como aiBusinessHours = null. Mantemos os
  // valores de `hours` no state mesmo com 24/7 ON pra preservar a config
  // anterior se o user voltar atrás.
  const [alwaysOn, setAlwaysOn] = useState(false);
  const [outOfHoursMessage, setOutOfHoursMessage] = useState('');
  const [businessNotes, setBusinessNotes] = useState('');
  const [autoDisable, setAutoDisable] = useState(true);
  const [signWithName, setSignWithName] = useState(false);
  const [tokenCap, setTokenCap] = useState<string>('');
  const [historyWindow, setHistoryWindow] = useState<string>('50');
  const [saving, setSaving] = useState(false);

  // Motor da AxChat: o cliente não configura chave/modelo próprio. Enquanto os
  // dados não chegam, assume `true` — melhor esconder o campo do que piscar um
  // formulário de chave pra quem não pode usá-lo.
  const usesAxchatAi = data?.axchatAiEnabled !== false;

  // ─── Watchdog state ──────────────────────────────
  const [watchdogEnabled, setWatchdogEnabled] = useState(true);
  const [watchdogHours, setWatchdogHours] =
    useState<BusinessHoursConfig>(DEFAULT_BUSINESS_HOURS);
  const [watchdogAlwaysOn, setWatchdogAlwaysOn] = useState(true);
  const [watchdogConfig, setWatchdogConfig] = useState<Required<WatchdogConfig>>(
    DEFAULT_WATCHDOG_CONFIG,
  );

  // ─── URL whitelist state ─────────────────────────
  const [allowedDomainsText, setAllowedDomainsText] = useState('');

  useEffect(() => {
    if (!data) return;
    setAiEnabled(data.aiEnabled);
    setAiTimezone(data.aiTimezone);
    setAlwaysOn(data.aiBusinessHours == null);
    setHours(data.aiBusinessHours ?? DEFAULT_BUSINESS_HOURS);
    setOutOfHoursMessage(data.aiOutOfHoursMessage ?? '');
    setBusinessNotes(data.aiBusinessNotes ?? '');
    setAutoDisable(data.aiAutoDisableOnHuman);
    setSignWithName(data.signMessagesWithSenderName ?? false);
    setTokenCap(data.aiMonthlyTokenCap?.toString() ?? '');
    setHistoryWindow((data.aiHistoryWindow ?? 50).toString());
    setWatchdogEnabled(data.watchdogEnabled);
    setWatchdogAlwaysOn(data.watchdogBusinessHours == null);
    setWatchdogHours(data.watchdogBusinessHours ?? DEFAULT_BUSINESS_HOURS);
    setWatchdogConfig({ ...DEFAULT_WATCHDOG_CONFIG, ...(data.watchdogConfig ?? {}) });
    setAllowedDomainsText((data.allowedUrlDomains ?? []).join('\n'));
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedDomains = allowedDomainsText
        .split(/[\n,]+/)
        .map((d) =>
          d
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/.*$/, ''),
        )
        .filter(Boolean);
      await aiSettingsService.update({
        aiEnabled,
        aiTimezone,
        aiBusinessHours: alwaysOn ? null : hours,
        aiOutOfHoursMessage: outOfHoursMessage,
        aiBusinessNotes: businessNotes.trim() ? businessNotes : null,
        aiAutoDisableOnHuman: autoDisable,
        signMessagesWithSenderName: signWithName,
        aiMonthlyTokenCap: tokenCap ? parseInt(tokenCap, 10) : null,
        // Clamp no cliente também: o backend rejeitaria (400), mas assim o
        // usuário não perde o resto do formulário por causa de um dígito.
        aiHistoryWindow: Math.min(
          Math.max(parseInt(historyWindow, 10) || 50, 5),
          200,
        ),
        watchdogEnabled,
        watchdogBusinessHours: watchdogAlwaysOn ? null : watchdogHours,
        watchdogConfig: watchdogConfig,
        allowedUrlDomains: parsedDomains.length > 0 ? parsedDomains : null,
      });
      toast.success('Configurações de IA salvas');
      qc.invalidateQueries({ queryKey: ['ai-settings'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const updateWatchdogDay = (
    day: Weekday,
    patch: Partial<{ enabled: boolean; windows: Array<[string, string]> }>,
  ) => {
    setWatchdogHours((prev) => ({
      ...prev,
      [day]: {
        enabled: prev[day]?.enabled ?? false,
        windows: prev[day]?.windows ?? [],
        ...patch,
      },
    }));
  };

  const addWatchdogWindow = (day: Weekday) => {
    setWatchdogHours((prev) => {
      const existing = prev[day]?.windows ?? [];
      return {
        ...prev,
        [day]: {
          enabled: prev[day]?.enabled ?? true,
          windows: [...existing, ['09:00', '18:00']],
        },
      };
    });
  };

  const removeWatchdogWindow = (day: Weekday, idx: number) => {
    setWatchdogHours((prev) => {
      const existing = prev[day]?.windows ?? [];
      return {
        ...prev,
        [day]: {
          enabled: prev[day]?.enabled ?? false,
          windows: existing.filter((_, i) => i !== idx),
        },
      };
    });
  };

  const updateDay = (
    day: Weekday,
    patch: Partial<{ enabled: boolean; windows: Array<[string, string]> }>,
  ) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        enabled: prev[day]?.enabled ?? false,
        windows: prev[day]?.windows ?? [],
        ...patch,
      },
    }));
  };

  const addWindow = (day: Weekday) => {
    setHours((prev) => {
      const existing = prev[day]?.windows ?? [];
      return {
        ...prev,
        [day]: {
          enabled: prev[day]?.enabled ?? true,
          windows: [...existing, ['09:00', '18:00']],
        },
      };
    });
  };

  const removeWindow = (day: Weekday, idx: number) => {
    setHours((prev) => {
      const existing = prev[day]?.windows ?? [];
      return {
        ...prev,
        [day]: {
          enabled: prev[day]?.enabled ?? false,
          windows: existing.filter((_, i) => i !== idx),
        },
      };
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
        <div className="h-72 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5" />
      </div>
    );
  }

  return (
    <div>
      {/* TOPO: esquerda (toggles + limite tokens + fora de horário + setores) / direita (modelos + canal) */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* ESQUERDA */}
        <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
      {/* Kill switch */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              IA habilitada (geral)
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Padrão pra novas conversas. Canais individuais podem sobrepor
              esse toggle (abaixo). Conversas individuais também podem forçar
              IA ON/OFF.
            </p>
            </div>
          </div>
          <Toggle checked={aiEnabled} onChange={setAiEnabled} />
        </label>
      </section>

      {/* Auto-disable on human */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Hand className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Pausar IA quando humano responde
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Assim que um atendente envia uma mensagem na conversa, a IA é
              automaticamente desativada nessa conversa específica.
            </p>
            </div>
          </div>
          <Toggle checked={autoDisable} onChange={setAutoDisable} />
        </label>
      </section>

      {/* Assinatura do remetente pro cliente */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Contact className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Mostrar nome do atendente pro cliente
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Inclui o nome de quem respondeu — atendente ou agente de IA — no
              começo de cada mensagem enviada ao cliente, no formato{' '}
              <span className="font-semibold">*Nome:*</span> seguido do texto.
              Útil pra o cliente saber com quem está falando, principalmente em
              transferências. Na plataforma o nome já aparece na bolha de toda
              forma.
            </p>
            </div>
          </div>
          <Toggle checked={signWithName} onChange={setSignWithName} />
        </label>
      </section>

      {/* Business hours */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Horário de atendimento
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {alwaysOn
                ? 'IA responde a qualquer hora — 24 horas por dia, todos os dias.'
                : 'Fora desses horários a IA não responde.'}
            </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Atendimento 24/7
              </span>
              <Toggle checked={alwaysOn} onChange={setAlwaysOn} />
            </label>
            <select
              value={aiTimezone}
              onChange={(e) => setAiTimezone(e.target.value)}
              disabled={alwaysOn}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-100"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        {alwaysOn ? null : (
        <div className="mt-4 space-y-3">
          {WEEKDAYS.map(({ key, label }) => {
            const day = hours[key] ?? { enabled: false, windows: [] };
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/40 px-3 py-2 dark:border-white/10 dark:bg-black"
              >
                <label className="flex w-24 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) =>
                      updateDay(key, { enabled: e.target.checked })
                    }
                    className="h-3.5 w-3.5 rounded border-zinc-300"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {label}
                  </span>
                </label>

                {day.enabled ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {(day.windows ?? []).map(([from, to], i) => (
                      <div key={i} className="flex items-center gap-1">
                        <input
                          type="time"
                          value={from}
                          onChange={(e) => {
                            const updated = [...(day.windows ?? [])];
                            updated[i] = [e.target.value, to];
                            updateDay(key, { windows: updated });
                          }}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black dark:text-zinc-100"
                        />
                        <span className="text-xs text-zinc-400">até</span>
                        <input
                          type="time"
                          value={to}
                          onChange={(e) => {
                            const updated = [...(day.windows ?? [])];
                            updated[i] = [from, e.target.value];
                            updateDay(key, { windows: updated });
                          }}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black dark:text-zinc-100"
                        />
                        <button
                          onClick={() => removeWindow(key, i)}
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addWindow(key)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3" /> Janela
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-400">Não atende</span>
                )}
              </div>
            );
          })}
        </div>
        )}
      </section>
        </div>

      {/* Limite de tokens + Mensagem fora de horário — lado a lado (25% cada), mesma altura */}
      <div className="grid grid-cols-2 items-stretch gap-4">
      {/* Token cap */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Limite mensal de tokens
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Soma input + output. Vazio = sem limite.
        </p>
        <input
          type="number"
          min="0"
          value={tokenCap}
          onChange={(e) => setTokenCap(e.target.value)}
          placeholder="ex: 1000000"
          className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
        />
          </div>
        </div>
      </section>

      {/* Janela de histórico que o agente lê */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Histórico que o agente lê
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Quantas mensagens anteriores da conversa entram no prompt. Mais
              mensagens = mais contexto, porém resposta mais cara e mais lenta.
              Para atendimento rápido, 50 costuma bastar.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={200}
                value={historyWindow}
                onChange={(e) => setHistoryWindow(e.target.value)}
                placeholder="50"
                className="w-32 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
              />
              <span className="text-xs text-zinc-500">mensagens (5 a 200)</span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-400">
              O que passa dessa janela não é esquecido de vez: a ficha do contato
              (resumo e fatos) continua indo no prompt em toda conversa.
            </p>
          </div>
        </div>
      </section>

      {/* Out of hours message */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <div className="flex items-start gap-3">
          <MoonStar className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Mensagem fora de horário (opcional)
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Texto enviado automaticamente quando alguém manda mensagem fora do
          horário configurado. Vazio = não responde nada.
        </p>
        <textarea
          value={outOfHoursMessage}
          onChange={(e) => setOutOfHoursMessage(e.target.value)}
          rows={2}
          placeholder="Olá! No momento estamos fora do horário de atendimento. Voltamos amanhã às 9h e respondemos sua mensagem por aqui."
          className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
        />
          </div>
        </div>
      </section>
      </div>

      {/* ─── Setores de Operação ────────────────────── */}
      <AgentSectorsSection />

      {/* URL Whitelist */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Domínios permitidos em links da IA
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Quando preenchida, a IA não consegue mandar URL com host fora
              dessa lista — o sistema bloqueia em runtime e força a IA a
              reescrever sem o link inventado. Match é por sufixo: <code className="font-mono text-[10px]">bravy.co</code> autoriza
              <code className="ml-1 font-mono text-[10px]">members.bravy.co</code>. Vazia = não bloqueia (só loga aviso).
            </p>
            <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Recomendado preencher — IA inventou domínios inexistentes em prod.
            </p>
            <textarea
              value={allowedDomainsText}
              onChange={(e) => setAllowedDomainsText(e.target.value)}
              rows={5}
              placeholder={`bravy.co\ntrivapp.com.br\nalunos.bravy.school`}
              className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
            <p className="mt-1 text-[10px] text-zinc-400">
              Um domínio por linha. Cole sem <code>https://</code> ou <code>www.</code> — a gente normaliza.
            </p>
          </div>
        </div>
      </section>
        </div>

        {/* DIREITA */}
        <div className="space-y-4">
          {usesAxchatAi ? (
            /* Motor da AxChat: nada pra configurar aqui — a chave é nossa. */
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    IA AxChat
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Seus agentes rodam no motor de IA da AxChat. Não é preciso
                    configurar chave de API nem contratar provider — está tudo
                    incluso no seu plano.
                  </p>
                  <p className="mt-2 text-[10px] text-zinc-400">
                    Quer usar um motor próprio (sua conta Anthropic, OpenAI,
                    OpenRouter, etc.)? Fale com o suporte para liberar a opção.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            /* IA própria: a chave de cada motor mora no próprio modelo cadastrado. */
            <AiModelProvidersSection />
          )}
          <ChannelAiOverrides />

          {/* Contexto do negócio — vai pro system prompt de TODOS os agentes */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Contexto do negócio (visto por todos os agentes)
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Texto livre que entra no system prompt de cada agente. Use pra info que
                  muda com frequência e vale pra qualquer fluxo:
                  como cada isca/lead magnet é entregue, horários de live, política de
                  reembolso, talking points atuais, regras especiais.
                  Atualize aqui em vez de editar agente por agente.
                </p>
                <textarea
                  value={businessNotes}
                  onChange={(e) => setBusinessNotes(e.target.value)}
                  rows={8}
                  maxLength={4000}
                  placeholder={`Exemplos:

Iscas gratuitas:
- "MAESTRIA": entrega via aula ao vivo todo dia às 20h, link liberado 30min antes no grupo do WhatsApp.
- "EBOOK": link de download enviado automaticamente por email após mandar a palavra.

Política de bônus:
- Liberação 7 dias após a compra, automaticamente no portal. Sem liberação manual antes disso.

Reembolso:
- Garantia de 7 dias. Após esse prazo, escalar pra atendimento humano.`}
                  className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed dark:border-white/10 dark:bg-black dark:text-zinc-100"
                />
                <p className="mt-1 text-right text-[10px] text-zinc-400">
                  {businessNotes.length} / 4000
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ─── Watchdog (full-width, abaixo do top grid) ────────────────────── */}
      <div className="mt-6 space-y-4">
      {/* Watchdog header */}
      <div className="mt-4 mb-2 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-amber-500" />
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Watchdog de conversas presas
        </h3>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        Detecta conversas onde a IA travou ou o humano abandonou e reativa o
        atendimento automaticamente. Roda em camadas: agenda um timer toda vez
        que o cliente manda mensagem e tem um cron de fallback que varre
        conversas presas a cada 15 minutos.
      </p>

      {/* Watchdog kill switch */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Watchdog habilitado
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Quando OFF, conversas presas ficam paradas até um humano
              intervir. Recomendado deixar ON.
            </p>
            </div>
          </div>
          <Toggle checked={watchdogEnabled} onChange={setWatchdogEnabled} />
        </label>
      </section>

      {/* Watchdog params */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Parâmetros
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Controle quanto o watchdog espera antes de reagir e quantas vezes
          tenta antes de marcar a conversa como presa.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="IA travou (status BOT)"
            hint="Minutos sem resposta com IA atendendo."
            suffix="min"
            value={watchdogConfig.delayBotMin}
            onChange={(v) =>
              setWatchdogConfig((c) => ({ ...c, delayBotMin: v }))
            }
            disabled={!watchdogEnabled}
          />
          <NumberField
            label="Ninguém pegou (PENDING)"
            hint="Minutos sem ninguém assumir a conversa."
            suffix="min"
            value={watchdogConfig.delayPendingMin}
            onChange={(v) =>
              setWatchdogConfig((c) => ({ ...c, delayPendingMin: v }))
            }
            disabled={!watchdogEnabled}
          />
          <NumberField
            label="Humano abandonou (OPEN)"
            hint="Minutos sem o atendente humano responder."
            suffix="min"
            value={watchdogConfig.delayHumanIdleMin}
            onChange={(v) =>
              setWatchdogConfig((c) => ({ ...c, delayHumanIdleMin: v }))
            }
            disabled={!watchdogEnabled}
          />
          <NumberField
            label="Tentativas máximas"
            hint="Após esse número, marca como presa e notifica gestor."
            suffix=""
            value={watchdogConfig.maxAttempts}
            onChange={(v) =>
              setWatchdogConfig((c) => ({ ...c, maxAttempts: v }))
            }
            disabled={!watchdogEnabled}
            min={1}
            max={10}
          />
        </div>
          </div>
        </div>
      </section>

      {/* Watchdog business hours */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Horário de atuação do watchdog
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {watchdogAlwaysOn
                ? 'Watchdog roda 24/7. Reativa conversas a qualquer hora.'
                : 'Fora desse horário o watchdog não reativa conversas.'}
            </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                24/7
              </span>
              <Toggle
                checked={watchdogAlwaysOn}
                onChange={setWatchdogAlwaysOn}
              />
            </label>
          </div>
        </div>

        {watchdogAlwaysOn ? null : (
          <div className="mt-4 space-y-3">
            {WEEKDAYS.map(({ key, label }) => {
              const day = watchdogHours[key] ?? { enabled: false, windows: [] };
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/40 px-3 py-2 dark:border-white/10 dark:bg-black"
                >
                  <label className="flex w-24 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={(e) =>
                        updateWatchdogDay(key, { enabled: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-zinc-300"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {label}
                    </span>
                  </label>

                  {day.enabled ? (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      {(day.windows ?? []).map(([from, to], i) => (
                        <div key={i} className="flex items-center gap-1">
                          <input
                            type="time"
                            value={from}
                            onChange={(e) => {
                              const updated = [...(day.windows ?? [])];
                              updated[i] = [e.target.value, to];
                              updateWatchdogDay(key, { windows: updated });
                            }}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black dark:text-zinc-100"
                          />
                          <span className="text-xs text-zinc-400">até</span>
                          <input
                            type="time"
                            value={to}
                            onChange={(e) => {
                              const updated = [...(day.windows ?? [])];
                              updated[i] = [from, e.target.value];
                              updateWatchdogDay(key, { windows: updated });
                            }}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black dark:text-zinc-100"
                          />
                          <button
                            onClick={() => removeWatchdogWindow(key, i)}
                            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addWatchdogWindow(key)}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/10"
                      >
                        <Plus className="h-3 w-3" /> Janela
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">Não atua</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>

      {/* Salvar alterações — no fim de tudo */}
      <div className="mt-6 flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  hint,
  suffix,
  value,
  onChange,
  disabled,
  min = 1,
  max = 1440,
}: {
  label: string;
  hint: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v) && v >= min && v <= max) onChange(v);
          }}
          className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-100"
        />
        {suffix ? (
          <span className="text-xs text-zinc-500">{suffix}</span>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
      type="button"
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/**
 * Lista todos os canais ativos com um tri-state selector pra IA por canal:
 *   "Padrão" (null) → segue o toggle global da org
 *   "Forçar ON" (true) → IA responde nesse canal mesmo se org tá OFF
 *   "Forçar OFF" (false) → IA não responde nesse canal mesmo com org ON
 *
 * Cada mudança chama PATCH /channels/:id imediatamente — não precisa salvar.
 */
function ChannelAiOverrides() {
  const qc = useQueryClient();
  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelsService.list(),
  });

  const update = async (id: string, value: boolean | null) => {
    try {
      await channelsService.update(id, { aiEnabled: value });
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success(
        value === null
          ? 'Canal seguindo padrão da org'
          : value
            ? 'IA forçada ON nesse canal'
            : 'IA desligada nesse canal',
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    }
  };

  const visible = (channels ?? []).filter((c) => !!c.isActive);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
      <div className="mb-3">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          IA por canal
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Sobrepõe o toggle geral acima por canal. Útil pra ligar IA só num
          número de teste, ou desligar num canal de produção temporariamente.
        </p>
      </div>

      {isLoading ? (
        <div className="h-12 animate-pulse rounded-md bg-zinc-100 dark:bg-white/5" />
      ) : visible.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Nenhum canal ativo. Adicione canais na aba Canais.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <ChannelOverrideRow
              key={c.id}
              channel={c}
              onChange={(v) => update(c.id, v)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ChannelOverrideRow({
  channel,
  onChange,
}: {
  channel: Channel;
  onChange: (v: boolean | null) => void;
}) {
  const opts: Array<{ value: 'inherit' | 'on' | 'off'; label: string; bg: string }> = [
    { value: 'inherit', label: 'Padrão', bg: 'bg-zinc-200 dark:bg-zinc-700' },
    { value: 'on', label: 'ON', bg: 'bg-emerald-500' },
    { value: 'off', label: 'OFF', bg: 'bg-red-500' },
  ];
  const current: 'inherit' | 'on' | 'off' =
    channel.aiEnabled === null || channel.aiEnabled === undefined
      ? 'inherit'
      : channel.aiEnabled
        ? 'on'
        : 'off';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-black">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {channel.name}
        </p>
        <p className="truncate text-[11px] text-zinc-500">
          {channel.type.replace('_', ' ').toLowerCase()}
        </p>
      </div>
      <div className="inline-flex rounded-md bg-zinc-200 p-0.5 dark:bg-black">
        {opts.map((opt) => {
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                onChange(
                  opt.value === 'inherit' ? null : opt.value === 'on',
                )
              }
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? `${opt.bg} text-white`
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── AI Model Providers section ─────────────────────────

/** Opção do select de modelo que libera o campo de texto livre. */
const OTHER_MODEL = '__other__';

/**
 * Valor sintético do select de motor: agrupa TODOS os providers do catálogo com
 * `requiresManualSetup` (hoje `custom` e `custom-anthropic`) numa opção só.
 * O provider real é escolhido no campo "Compatibilidade da API".
 */
const CUSTOM_ENGINE = '__custom__';

/** Rótulo do formato de API, derivado do transporte do catálogo. */
const TRANSPORT_LABEL: Record<string, string> = {
  'openai-compat': 'OpenAI',
  anthropic: 'Anthropic',
};

type TestResult = { success: boolean; message: string; latencyMs?: number };

/** Erro da API vem em `response.data.message` (string ou array do class-validator). */
function apiErrorMessage(err: unknown, fallback: string) {
  const msg = (err as any)?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  if (typeof msg === 'string' && msg) return msg;
  return err instanceof Error ? err.message : fallback;
}

function AiModelProvidersSection() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [modelChoice, setModelChoice] = useState('');
  const [modelId, setModelId] = useState('');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Catálogo: fonte única da verdade dos motores/modelos (vem do backend).
  const { data: catalog = [] } = useQuery({
    queryKey: ['ai-model-catalog'],
    queryFn: () => aiModelProvidersService.catalog(),
    staleTime: Infinity,
  });

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['ai-model-providers'],
    queryFn: () => aiModelProvidersService.list(),
  });

  // Motores "de prateleira" x personalizados. Os personalizados (um por formato
  // de API) aparecem como UMA opção "Personalizado" no select; qual dos dois vai
  // no payload é decidido no campo "Compatibilidade da API".
  const stockProviders = catalog.filter((p) => !p.requiresManualSetup);
  const customProviders = catalog.filter((p) => p.requiresManualSetup);
  const defaultCustomId =
    customProviders.find((p) => p.transport === 'openai-compat')?.id ??
    customProviders[0]?.id ??
    '';
  const defaultProviderId = stockProviders[0]?.id ?? catalog[0]?.id ?? '';

  // Assim que o catálogo chega, deixa o primeiro motor pré-selecionado.
  useEffect(() => {
    if (!providerId && defaultProviderId) setProviderId(defaultProviderId);
  }, [defaultProviderId, providerId]);

  const selected = catalog.find((p) => p.id === providerId) ?? null;
  const isCustomEngine = !!selected && selected.requiresManualSetup;
  // Motor fora do catálogo (registro legado) cai no mesmo fluxo do
  // "Personalizado": o usuário digita modelo e base-URL na mão. Mas continua
  // aparecendo com o próprio id no select — não vira "Personalizado".
  const manualSetup = selected ? selected.requiresManualSetup : true;
  const engineValue = isCustomEngine ? CUSTOM_ENGINE : providerId;
  const catalogModels = selected?.models ?? [];
  const typingModelId = manualSetup || catalogModels.length === 0 || modelChoice === OTHER_MODEL;

  const createMutation = useMutation({
    mutationFn: () =>
      aiModelProvidersService.create({
        provider: providerId,
        name: name.trim(),
        modelId: modelId.trim(),
        apiKey: apiKey.trim() || undefined,
        // Vazio = o backend resolve pela `defaultBaseUrl` do catálogo.
        baseUrl: baseUrl.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('IA adicionada');
      qc.invalidateQueries({ queryKey: ['ai-model-providers'] });
      resetForm();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Erro ao adicionar')),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      aiModelProvidersService.update(editingId!, {
        provider: providerId,
        name: name.trim(),
        modelId: modelId.trim(),
        // Campo de chave vazio = mantém a atual (a chave nunca volta do backend).
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        baseUrl: baseUrl.trim() || null,
        isActive: true,
      }),
    onSuccess: () => {
      toast.success('IA atualizada');
      qc.invalidateQueries({ queryKey: ['ai-model-providers'] });
      resetForm();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Erro ao atualizar')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => aiModelProvidersService.remove(id),
    onSuccess: () => {
      toast.success('IA removida');
      qc.invalidateQueries({ queryKey: ['ai-model-providers'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Erro ao remover')),
  });

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      const result = await aiModelProvidersService.testConnection(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } catch (err) {
      const message = apiErrorMessage(err, 'Erro ao testar conexão');
      setTestResults((prev) => ({ ...prev, [id]: { success: false, message } }));
      toast.error(message);
    } finally {
      setTestingId(null);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setProviderId(defaultProviderId);
    setModelChoice('');
    setModelId('');
    setName('');
    setApiKey('');
    setBaseUrl('');
    setShowAdvanced(false);
  };

  /** `value` é o do select de motor — pode ser o id sintético do Personalizado. */
  const handleEngineChange = (value: string) => {
    setProviderId(value === CUSTOM_ENGINE ? defaultCustomId : value);
    setModelChoice('');
    setModelId('');
    setName('');
    setBaseUrl('');
    setShowAdvanced(false);
  };

  const handleModelChoiceChange = (value: string) => {
    setModelChoice(value);
    if (value === OTHER_MODEL) {
      setModelId('');
      return;
    }
    const picked = catalogModels.find((m) => m.modelId === value);
    if (picked) {
      setModelId(picked.modelId);
      // Nome sugerido a partir do modelo — o usuário pode trocar depois.
      setName(picked.label);
    }
  };

  const startEdit = (m: AiModelProvider) => {
    const prov = catalog.find((p) => p.id === m.provider);
    const inCatalog = !!prov?.models.some((x) => x.modelId === m.modelId);
    setEditingId(m.id);
    setProviderId(m.provider);
    setModelChoice(inCatalog ? m.modelId : OTHER_MODEL);
    setModelId(m.modelId);
    setName(m.name);
    setApiKey('');
    setBaseUrl(m.baseUrl ?? '');
    // Abre o "avançado" se o registro já tem base-URL própria, senão o
    // update mandaria `null` e quebraria uma config que funcionava.
    setShowAdvanced(!!m.baseUrl);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!providerId) {
      toast.error('Escolha o motor de IA');
      return;
    }
    if (!modelId.trim()) {
      toast.error('Escolha ou digite o modelo');
      return;
    }
    if (!name.trim()) {
      toast.error('Dê um nome pra essa IA');
      return;
    }
    if (manualSetup && !baseUrl.trim()) {
      toast.error('Motor personalizado exige a base-URL da API');
      return;
    }
    if (!editingId && !manualSetup && !apiKey.trim()) {
      toast.error('Informe a chave de API do provedor');
      return;
    }
    if (editingId) updateMutation.mutate();
    else createMutation.mutate();
  };

  const inputCls =
    'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500';
  const labelCls = 'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300';

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Modelos de IA
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Escolha o motor (Anthropic, OpenAI, Google ou um endpoint
              personalizado), o modelo e cole a chave da sua conta. Só o que
              estiver aqui aparece como opção na configuração dos agentes.
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Adicionar IA
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
          {/* 1. Motor */}
          <div>
            <label className={labelCls}>Motor de IA</label>
            <select
              value={engineValue}
              onChange={(e) => handleEngineChange(e.target.value)}
              className={inputCls}
            >
              {stockProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              {/* Todos os motores manuais colapsam numa opção só. */}
              {customProviders.length > 0 && (
                <option value={CUSTOM_ENGINE}>Personalizado</option>
              )}
              {/* Registro antigo com motor que saiu do catálogo. */}
              {providerId && !selected && (
                <option value={providerId}>{providerId} (fora do catálogo)</option>
              )}
            </select>
          </div>

          {/* 1b. Compatibilidade — só no Personalizado: define o provider real */}
          {isCustomEngine && customProviders.length > 1 && (
            <div>
              <label className={labelCls}>Compatibilidade da API</label>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className={inputCls}
              >
                {customProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {TRANSPORT_LABEL[p.transport] ?? p.transport}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-zinc-400">
                É o formato que o serviço fala. A maioria dos provedores
                (OpenRouter, Groq, Together, Ollama, proxies) usa o formato da
                OpenAI — escolha Anthropic só se o endpoint expõe a Messages API
                do Claude.
              </p>
            </div>
          )}

          {/* 2. Modelo */}
          {catalogModels.length > 0 && (
            <div>
              <label className={labelCls}>Modelo</label>
              <select
                value={modelChoice}
                onChange={(e) => handleModelChoiceChange(e.target.value)}
                className={inputCls}
              >
                <option value="" disabled>Selecione um modelo…</option>
                {catalogModels.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.label}{m.hint ? ` — ${m.hint}` : ''}
                  </option>
                ))}
                <option value={OTHER_MODEL}>Outro modelo (digitar ID)…</option>
              </select>
            </div>
          )}

          {typingModelId && (
            <div>
              <label className={labelCls}>
                ID do modelo <span className="text-zinc-400">(exatamente como o provedor espera)</span>
              </label>
              <input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="ex: claude-sonnet-4-6"
                className={`${inputCls} font-mono`}
              />
            </div>
          )}

          {/* 3. Base-URL: obrigatória no personalizado, avançada nos demais */}
          {manualSetup ? (
            <div>
              <label className={labelCls}>
                Base-URL da API <span className="text-zinc-400">(obrigatória)</span>
              </label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  selected?.transport === 'anthropic'
                    ? 'https://seu-gateway.com/anthropic'
                    : 'https://openrouter.ai/api/v1'
                }
                className={`${inputCls} font-mono`}
              />
              <p className="mt-1 text-[10px] text-zinc-400">
                {selected?.transport === 'anthropic'
                  ? 'Endpoint que fala a Messages API da Anthropic — gateway ou proxy corporativo de Claude.'
                  : 'Qualquer API compatível com o formato da OpenAI — OpenRouter, Groq, Ollama, proxy interno.'}
              </p>
            </div>
          ) : showAdvanced ? (
            <div>
              <label className={labelCls}>
                Base-URL da API <span className="text-zinc-400">(opcional — só pra proxy/endpoint próprio)</span>
              </label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={selected?.defaultBaseUrl ?? 'padrão do provedor'}
                className={`${inputCls} font-mono`}
              />
              <p className="mt-1 text-[10px] text-zinc-400">
                Deixe vazio para usar o endereço padrão do provedor.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdvanced(true)}
              className="text-[11px] font-medium text-zinc-500 underline-offset-2 hover:underline"
            >
              Configuração avançada (base-URL própria)
            </button>
          )}

          {/* 4. Nome */}
          <div>
            <label className={labelCls}>Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Claude Sonnet 4.6"
              className={inputCls}
            />
            <p className="mt-1 text-[10px] text-zinc-400">
              É o rótulo que aparece na hora de escolher a IA de cada agente.
            </p>
          </div>

          {/* 5. Chave */}
          <div>
            <label className={labelCls}>Chave de API</label>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editingId ? 'deixe vazio para manter a chave atual' : 'sk-…'}
              className={`${inputCls} font-mono`}
            />
            <p className="mt-1 text-[10px] text-zinc-400">
              {selected?.keyHint ?? 'A chave do serviço que você vai conectar.'}
              {' '}A chave é salva criptografada e nunca é exibida de volta.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {editingId ? 'Salvar alterações' : 'Adicionar IA'}
            </button>
            <button
              onClick={resetForm}
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />
        ) : models.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/15 dark:bg-white/5">
            Nenhuma IA configurada. Clique em &quot;Adicionar IA&quot; para começar.
          </p>
        ) : (
          models.map((m) => {
            const providerLabel = catalog.find((p) => p.id === m.provider)?.label ?? m.provider;
            const result = testResults[m.id];
            return (
              <div
                key={m.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-black"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${m.isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.name}</p>
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {providerLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                      <code className="font-mono">{m.modelId}</code>
                      {m.apiKeySet ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <KeyRound className="h-3 w-3" />
                          <span className="font-mono">{m.apiKeyPreview ?? 'chave configurada'}</span>
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">sem chave</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTestConnection(m.id)}
                      disabled={testingId === m.id}
                      className="rounded p-1.5 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                      title="Testar conexão"
                    >
                      {testingId === m.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="h-3.5 w-3.5" />
                      }
                    </button>
                    <button
                      onClick={() => startEdit(m)}
                      className="rounded p-1.5 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remover "${m.name}"?`)) removeMutation.mutate(m.id);
                      }}
                      className="rounded p-1.5 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      title="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {result && (
                  <div
                    className={`flex items-start gap-1.5 border-t px-4 py-2 text-[11px] ${
                      result.success
                        ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-400'
                        : 'border-red-200 text-red-600 dark:border-red-900/40 dark:text-red-400'
                    }`}
                  >
                    {result.success
                      ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
                      : <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                    }
                    <span className="min-w-0 break-words">
                      {result.message}
                      {/* O backend já cita a latência no texto de sucesso — não repete. */}
                      {typeof result.latencyMs === 'number' &&
                        !result.message.includes(`${result.latencyMs}ms`) && (
                        <span className="ml-1 text-zinc-400">({result.latencyMs} ms)</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Agent Sectors section ────────────────────────────
const SECTOR_ICONS = [
  'Briefcase', 'Headphones', 'Megaphone', 'Users', 'BarChart3',
  'ShieldCheck', 'Wrench', 'ShoppingCart', 'GraduationCap',
];

const SECTOR_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1',
];

function AgentSectorsSection() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sectorName, setSectorName] = useState('');
  const [sectorDescription, setSectorDescription] = useState('');
  const [sectorIcon, setSectorIcon] = useState('Briefcase');
  const [sectorColor, setSectorColor] = useState('#8b5cf6');

  const { data: sectors = [], isLoading } = useQuery({
    queryKey: ['agent-sectors'],
    queryFn: () => agentSectorsService.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      agentSectorsService.create({
        name: sectorName.trim(),
        description: sectorDescription.trim() || undefined,
        icon: sectorIcon,
        color: sectorColor,
      }),
    onSuccess: () => {
      toast.success('Setor criado');
      qc.invalidateQueries({ queryKey: ['agent-sectors'] });
      resetForm();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar'),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      agentSectorsService.update(editingId!, {
        name: sectorName.trim(),
        description: sectorDescription.trim() || undefined,
        icon: sectorIcon,
        color: sectorColor,
      }),
    onSuccess: () => {
      toast.success('Setor atualizado');
      qc.invalidateQueries({ queryKey: ['agent-sectors'] });
      resetForm();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao atualizar'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => agentSectorsService.remove(id),
    onSuccess: () => {
      toast.success('Setor removido');
      qc.invalidateQueries({ queryKey: ['agent-sectors'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao remover'),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSectorName('');
    setSectorDescription('');
    setSectorIcon('Briefcase');
    setSectorColor('#8b5cf6');
  };

  const startEdit = (s: AgentSector) => {
    setEditingId(s.id);
    setSectorName(s.name);
    setSectorDescription(s.description ?? '');
    setSectorIcon(s.icon ?? 'Briefcase');
    setSectorColor(s.color ?? '#8b5cf6');
    setShowForm(true);
  };

  const handleSave = () => {
    if (!sectorName.trim()) {
      toast.error('Nome do setor é obrigatório');
      return;
    }
    if (editingId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const inputCls =
    'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500';

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Layers className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Setores de Operação
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Organize seus agentes em setores (ex: Suporte, Marketing, Vendas).
              Cada agente pode pertencer a múltiplos setores.
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Novo setor
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome do setor *</label>
              <input
                type="text"
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                placeholder="Ex: Suporte"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Descrição</label>
              <input
                type="text"
                value={sectorDescription}
                onChange={(e) => setSectorDescription(e.target.value)}
                placeholder="Ex: Agentes que atendem dúvidas técnicas e pós-venda"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Ícone</label>
              <select
                value={sectorIcon}
                onChange={(e) => setSectorIcon(e.target.value)}
                className={inputCls}
              >
                {SECTOR_ICONS.map((ico) => (
                  <option key={ico} value={ico}>{ico}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Cor</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={sectorColor}
                  onChange={(e) => setSectorColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border border-zinc-300 bg-white p-0.5 dark:border-white/15"
                />
                <span className="text-xs text-zinc-500">{sectorColor}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {editingId ? 'Atualizar setor' : 'Criar setor'}
            </button>
            <button onClick={resetForm} className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />
        ) : sectors.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/15 dark:bg-white/5">
            Nenhum setor cadastrado. Crie setores para organizar seus agentes por área de operação.
          </p>
        ) : (
          sectors.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-white/10 dark:bg-black"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: s.color ?? '#8b5cf6' }}
                >
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.name}</p>
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      {s.agents.length} agente{s.agents.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {s.description || 'Sem descrição cadastrada'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">
                    Ícone: <code className="font-mono">{s.icon ?? '-'}</code> · Ordem: {s.order + 1}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(s)}
                  className="rounded p-1.5 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  title="Editar"
                >
                  ✏️
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Remover o setor "${s.name}"? Os agentes não serão afetados.`)) removeMutation.mutate(s.id);
                  }}
                  className="rounded p-1.5 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
