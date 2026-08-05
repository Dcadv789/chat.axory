'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell, Monitor, Smartphone, Volume2, VolumeX, Moon, Loader2,
  MessageSquare, Users, AlertTriangle, ArrowRightLeft, AtSign, Cog,
} from 'lucide-react';
import { notificationsSettingsService } from '../services/notifications.service';

const notifTypes = [
  { type: 'NEW_MESSAGE', label: 'Nova mensagem', description: 'Quando um cliente envia uma mensagem', icon: MessageSquare },
  { type: 'CONVERSATION_ASSIGNED', label: 'Conversa atribuída', description: 'Quando uma conversa é atribuída a você', icon: Users },
  { type: 'CONVERSATION_TRANSFERRED', label: 'Transferência', description: 'Quando uma conversa é transferida para você', icon: ArrowRightLeft },
  { type: 'SLA_WARNING', label: 'Alerta de SLA', description: 'Quando o tempo de SLA está se esgotando', icon: AlertTriangle },
  { type: 'SLA_BREACH', label: 'SLA violado', description: 'Quando o SLA foi ultrapassado', icon: AlertTriangle },
  { type: 'MENTION', label: 'Menção', description: 'Quando alguém menciona você em uma nota', icon: AtSign },
  { type: 'SYSTEM', label: 'Sistema', description: 'Avisos e atualizações do sistema', icon: Cog },
];

interface Preferences {
  [type: string]: { inApp: boolean; browserPush: boolean; sound: boolean };
}

const defaultPrefs = (): Preferences =>
  Object.fromEntries(notifTypes.map((t) => [t.type, { inApp: true, browserPush: true, sound: true }]));

export function NotificationsManager() {
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndStart, setDndStart] = useState('22:00');
  const [dndEnd, setDndEnd] = useState('08:00');
  const [saving, setSaving] = useState(false);

  const { data: saved } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => notificationsSettingsService.getPreferences(),
  });

  // Só sobrescreve os tipos que o usuário já salvou; o resto segue no default
  // (tudo ligado), pra que um tipo novo do produto não nasça desligado.
  useEffect(() => {
    if (!saved) return;
    setPrefs((prev) => {
      const next = { ...prev };
      for (const item of saved.preferences) {
        if (!next[item.type]) continue;
        next[item.type] = {
          inApp: item.inApp,
          browserPush: item.browserPush,
          sound: item.sound,
        };
      }
      return next;
    });
    setDndEnabled(saved.dndEnabled);
    if (saved.dndStart) setDndStart(saved.dndStart);
    if (saved.dndEnd) setDndEnd(saved.dndEnd);
  }, [saved]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    } else {
      setPushPermission('unsupported');
    }
  }, []);

  const handleRequestPush = async () => {
    if (!('Notification' in window)) {
      toast.error('Notificações push não são suportadas neste navegador');
      return;
    }
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission === 'granted') {
      toast.success('Notificações push ativadas!');
    } else {
      toast.error('Permissão negada pelo navegador');
    }
  };

  const toggle = (type: string, channel: 'inApp' | 'browserPush' | 'sound') => {
    setPrefs((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type][channel] },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await notificationsSettingsService.savePreferences({
        preferences: notifTypes.map((t) => ({
          type: t.type,
          inApp: prefs[t.type].inApp,
          browserPush: prefs[t.type].browserPush,
          sound: prefs[t.type].sound,
        })),
        dndEnabled,
        dndStart,
        dndEnd,
      });
      toast.success('Preferências salvas!');
      qc.invalidateQueries({ queryKey: ['notification-preferences'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar preferências');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Linha superior: Não perturbe | status do push | Salvar preferências */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Não perturbe */}
        <div className="flex items-center gap-3 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-white/5">
          <Moon className="h-5 w-5 shrink-0 text-violet-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Não perturbe</p>
            <p className="text-xs text-zinc-500">Silenciar em horários</p>
          </div>
          <button
            onClick={() => setDndEnabled(!dndEnabled)}
            className={`relative ml-1 h-6 w-11 shrink-0 rounded-full transition-colors ${dndEnabled ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-600'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${dndEnabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Status do push */}
        <div className="min-w-[200px] flex-1">
          {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Notificações push desativadas</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">Ative para receber alertas com a aba fechada</p>
                </div>
              </div>
              <button
                onClick={handleRequestPush}
                className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Ativar push
              </button>
            </div>
          )}
          {pushPermission === 'granted' && (
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800/50 dark:bg-green-900/20">
              <Monitor className="h-5 w-5 shrink-0 text-green-600" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">Notificações push ativas</p>
                <p className="text-xs text-green-600 dark:text-green-400">Você receberá alertas no navegador</p>
              </div>
            </div>
          )}
        </div>

        {/* Salvar preferências */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar preferências
        </button>
      </div>

      {/* Faixa de horários do Não perturbe (aparece ao ligar) */}
      {dndEnabled && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-white/5">
          <div>
            <label className="block text-[10px] font-medium uppercase text-zinc-400 mb-1">De</label>
            <input
              type="time"
              value={dndStart}
              onChange={(e) => setDndStart(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            />
          </div>
          <span className="mt-4 text-zinc-400">até</span>
          <div>
            <label className="block text-[10px] font-medium uppercase text-zinc-400 mb-1">Até</label>
            <input
              type="time"
              value={dndEnd}
              onChange={(e) => setDndEnd(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            />
          </div>
        </div>
      )}

      {/* Matriz de tipos de notificação */}
      <div className="mt-6">
        <div className="overflow-hidden rounded-lg border border-zinc-100 dark:border-white/10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Tipo de notificação</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <div className="flex flex-col items-center gap-0.5">
                    <Bell className="h-3.5 w-3.5" />
                    <span>In-app</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <div className="flex flex-col items-center gap-0.5">
                    <Monitor className="h-3.5 w-3.5" />
                    <span>Push</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <div className="flex flex-col items-center gap-0.5">
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Som</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {notifTypes.map((nt) => {
                const Icon = nt.icon;
                const pref = prefs[nt.type];
                return (
                  <tr key={nt.type} className="border-b border-zinc-50 dark:border-white/10">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                        <div>
                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{nt.label}</p>
                          <p className="text-[11px] text-zinc-400">{nt.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Toggle checked={pref.inApp} onChange={() => toggle(nt.type, 'inApp')} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Toggle checked={pref.browserPush} onChange={() => toggle(nt.type, 'browserPush')} disabled={pushPermission !== 'granted'} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Toggle checked={pref.sound} onChange={() => toggle(nt.type, 'sound')} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative mx-auto h-5 w-9 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-600'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
