'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { aiAgentsService } from '@/features/ai-agents/services/ai-agents.service';
import { cronsService } from '../services/crons.service';
import { useOrgId } from '@/hooks/use-org-query-key';

interface CreateCronDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100';

// Presets geram a expressão cron de 5 campos. O `hour` é injetado nos que têm horário.
const PRESETS: Array<{
  key: string;
  label: string;
  build: (hour: number) => string;
  hint: string;
}> = [
  { key: 'hourly', label: 'De hora em hora', build: () => '0 * * * *', hint: 'Todo minuto 0 de cada hora' },
  { key: 'daily', label: 'Diário', build: (h) => `0 ${h} * * *`, hint: 'Todo dia no horário escolhido' },
  { key: 'weekly', label: 'Semanal (seg)', build: (h) => `0 ${h} * * 1`, hint: 'Toda segunda-feira' },
  { key: 'monthly', label: 'Mensal (dia 1)', build: (h) => `0 ${h} 1 * *`, hint: 'Todo dia 1 do mês' },
];

export function CreateCronDialog({ open, onClose, onCreated }: CreateCronDialogProps) {
  const orgId = useOrgId();
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [task, setTask] = useState('');
  const [hour, setHour] = useState(9);
  const [preset, setPreset] = useState('monthly');
  const [advanced, setAdvanced] = useState(false);
  const [cronExpression, setCronExpression] = useState('0 9 1 * *');
  const [saving, setSaving] = useState(false);

  const { data: agents = [] } = useQuery({
    queryKey: ['ai-agents', orgId],
    queryFn: () => aiAgentsService.list(),
    enabled: open,
  });

  // Agentes de marketing primeiro (são os candidatos naturais a cron).
  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        if (a.sector !== b.sector) return a.sector === 'MARKETING' ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [agents],
  );

  if (!open) return null;

  const applyPreset = (key: string) => {
    setPreset(key);
    const def = PRESETS.find((p) => p.key === key);
    if (def) setCronExpression(def.build(hour));
  };

  const applyHour = (h: number) => {
    setHour(h);
    const def = PRESETS.find((p) => p.key === preset);
    if (def && !advanced) setCronExpression(def.build(h));
  };

  const handleSave = async () => {
    if (!agentId) return toast.error('Selecione um agente.');
    if (!name.trim()) return toast.error('Dê um nome ao cron.');
    if (!task.trim()) return toast.error('Descreva a tarefa do agente.');
    if (!cronExpression.trim()) return toast.error('Defina o agendamento.');

    setSaving(true);
    try {
      await cronsService.create({
        agentId,
        name: name.trim(),
        task: task.trim(),
        cronExpression: cronExpression.trim(),
      });
      toast.success('Cron criado!');
      onCreated();
      onClose();
      // reset
      setAgentId('');
      setName('');
      setTask('');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? 'Erro ao criar cron';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSaving(false);
    }
  };

  const showHour = preset !== 'hourly' && !advanced;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-black">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/10">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Novo cron de agente
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Agente
            </label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione um agente…</option>
              {sortedAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.sector === 'MARKETING' ? 'Marketing' : 'Atendimento'} ({a.kind === 'ORCHESTRATOR' ? 'Orquestrador' : 'Worker'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Revisão mensal de mídia"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Tarefa (o que o agente deve fazer)
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={5}
              placeholder="Ex: Revise a performance de mídia paga do último mês e proponha ajustes de budget para as campanhas com pior CPA."
              className={inputCls}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Esse texto vira a mensagem-gatilho do agente quando o cron disparar.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Agendamento
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setAdvanced(false);
                    applyPreset(p.key);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    !advanced && preset === p.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAdvanced(true)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  advanced
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
                }`}
              >
                Avançado (cron)
              </button>
            </div>

            {showHour && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">às</span>
                <select
                  value={hour}
                  onChange={(e) => applyHour(Number(e.target.value))}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
            )}

            {advanced && (
              <div className="mt-3">
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 9 1 * *"
                  className={`${inputCls} font-mono`}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  5 campos: minuto hora dia-mês mês dia-semana.
                </p>
              </div>
            )}

            <p className="mt-3 text-xs text-zinc-500">
              Expressão atual:{' '}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-700 dark:bg-white/10 dark:text-zinc-300">
                {cronExpression || '—'}
              </code>{' '}
              · fuso America/Sao_Paulo
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-white/10">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Criar cron'}
          </button>
        </div>
      </div>
    </div>
  );
}
