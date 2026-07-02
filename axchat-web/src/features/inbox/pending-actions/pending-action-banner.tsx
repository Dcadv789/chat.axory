'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Clock, Info, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useApprovePendingAction,
  useRejectPendingAction,
} from './use-pending-actions';
import type {
  PendingAction,
  PendingActionImpact,
} from './types';

interface Props {
  action: PendingAction;
  /** Stagger index for the entrance animation (50ms steps). */
  index?: number;
}

interface ImpactStyle {
  card: string;
  badge: string;
  iconWrap: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const IMPACT_STYLES: Record<PendingActionImpact, ImpactStyle> = {
  low: {
    card: 'border-blue-300 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/30',
    badge:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    iconWrap:
      'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300',
    Icon: Info,
  },
  medium: {
    card: 'border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    iconWrap:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    Icon: Info,
  },
  high: {
    card: 'border-orange-400 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/30',
    badge:
      'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
    iconWrap:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    Icon: AlertTriangle,
  },
  critical: {
    card: 'border-red-400 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    iconWrap: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    Icon: AlertTriangle,
  },
};

const TOOL_LABELS: Record<string, string> = {
  grantAccess: 'Liberar acesso',
  resetPassword: 'Resetar senha',
  transferToHuman: 'Transferir para humano',
  // Marketing — nomes que um dono de empresa entende (nada de nome de API).
  createMetaAdsCampaign: 'Criar campanha de anúncio',
  createMetaAdsAdSet: 'Criar conjunto de anúncios',
  createMetaAdsConversionAdSet: 'Criar conjunto de anúncios',
  createMetaAdsAdCreative: 'Criar criativo do anúncio',
  createMetaAdsAd: 'Criar anúncio',
  updateMetaAdsCampaignBudget: 'Definir orçamento diário',
  updateMetaAdsAdSetBudget: 'Definir orçamento diário',
  updateMetaAdsAdSetTargeting: 'Ajustar público do anúncio',
  setMetaAdsStatus: 'Ligar / pausar anúncio',
  publishInstagramMedia: 'Publicar post no Instagram',
  createGoogleBusinessPost: 'Publicar no Google',
  replyToGoogleBusinessReview: 'Responder avaliação no Google',
};

// ─── Tradução dos parâmetros técnicos pra linguagem de negócio ───

const ARG_LABELS: Record<string, string> = {
  name: 'Nome',
  objective: 'Objetivo',
  campaignId: 'ID no Meta',
  adSetId: 'ID no Meta',
  entityId: 'ID no Meta',
  objectId: 'ID no Meta',
  creativeId: 'ID do criativo',
  dailyBudgetCents: 'Orçamento por dia',
  status: 'Ação',
  message: 'Texto do anúncio',
  caption: 'Legenda',
  summary: 'Texto',
  imageUrl: 'Imagem',
  destinationUrl: 'Link de destino',
  ctaType: 'Botão',
  conversionEvent: 'Evento de conversão',
  targeting: 'Público',
  reason: 'Motivo',
};

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_LEADS: 'Captação de contatos (leads)',
  OUTCOME_SALES: 'Vendas / conversões',
  OUTCOME_TRAFFIC: 'Visitas ao site (tráfego)',
  OUTCOME_AWARENESS: 'Alcance / reconhecimento da marca',
  OUTCOME_ENGAGEMENT: 'Engajamento',
  OUTCOME_APP_PROMOTION: 'Promoção de aplicativo',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '▶ LIGAR — começa a veicular e a gastar verba',
  PAUSED: '⏸ PAUSAR — para de veicular e de gastar',
};

const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: '"Saiba mais"',
  SHOP_NOW: '"Comprar agora"',
  SIGN_UP: '"Cadastre-se"',
  CONTACT_US: '"Fale conosco"',
  BOOK_TRAVEL: '"Reservar"',
  GET_QUOTE: '"Pedir orçamento"',
  SUBSCRIBE: '"Assinar"',
  WHATSAPP_MESSAGE: '"Chamar no WhatsApp"',
};

function humanizeArgValue(key: string, raw: unknown): string {
  if (/cents$/i.test(key) && Number.isFinite(Number(raw))) {
    return `R$ ${(Number(raw) / 100).toFixed(2).replace('.', ',')} por dia`;
  }
  const v = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (key === 'objective') return OBJECTIVE_LABELS[v] ?? v;
  if (key === 'status') return STATUS_LABELS[v] ?? v;
  if (key === 'ctaType') return CTA_LABELS[v] ?? v;
  return v;
}

/**
 * Título humano do card. Cards antigos guardaram "Executar <tool>" no
 * preview — nesses casos (e só neles) montamos a descrição no cliente.
 */
function describeAction(action: PendingAction): string {
  const p = action.preview?.action ?? '';
  if (p && !p.startsWith('Executar ')) return p;
  const a = action.args ?? {};
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
  const money = (k: string) =>
    Number.isFinite(Number(a[k])) && Number(a[k]) > 0
      ? `R$ ${(Number(a[k]) / 100).toFixed(2).replace('.', ',')}`
      : undefined;
  switch (action.toolName) {
    case 'createMetaAdsCampaign':
      return `Criar a campanha "${s('name') ?? '?'}" — nasce pausada, não gasta nada até você ligar`;
    case 'updateMetaAdsCampaignBudget':
    case 'updateMetaAdsAdSetBudget':
      return `Definir o orçamento em ${money('dailyBudgetCents') ?? '?'} por dia`;
    case 'setMetaAdsStatus':
      return s('status') === 'ACTIVE'
        ? 'Ligar o anúncio — a partir daí ele veicula e gasta verba de verdade'
        : 'Pausar o anúncio — para de veicular e de gastar';
    case 'publishInstagramMedia':
      return 'Publicar o post no Instagram (vai ao ar público)';
    default:
      return p || (TOOL_LABELS[action.toolName] ?? action.toolName);
  }
}

/**
 * Parâmetros que a ação vai executar, legíveis pro aprovador conferir
 * ANTES de clicar. Campos *Cents viram R$; valores longos são truncados.
 */
function formatArgs(
  args: Record<string, unknown>,
): Array<{ k: string; v: string; technical: boolean }> {
  const out: Array<{ k: string; v: string; technical: boolean }> = [];
  for (const [k, raw] of Object.entries(args ?? {})) {
    if (raw === undefined || raw === null || raw === '') continue;
    let v = humanizeArgValue(k, raw);
    if (v.length > 140) v = `${v.slice(0, 140)}…`;
    out.push({
      k: ARG_LABELS[k] ?? k,
      v,
      // IDs do Meta são conferência técnica — mostrados menores, no fim.
      technical: (ARG_LABELS[k] ?? k) === 'ID no Meta',
    });
  }
  // Campos de negócio primeiro; IDs técnicos por último.
  out.sort((a, b) => Number(a.technical) - Number(b.technical));
  return out;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expirado';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${String(remMinutes).padStart(2, '0')}m`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Live countdown to `expiresAt`. Re-renders every second via local
 * state. We rebase on the prop in case the action gets refreshed with a
 * new expiration (rare but cheap to support).
 */
function useCountdown(expiresAt: string): number {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, target - now);
}

export function PendingActionBanner({ action, index = 0 }: Props) {
  const style = IMPACT_STYLES[action.preview.impact] ?? IMPACT_STYLES.medium;
  const remainingMs = useCountdown(action.expiresAt);
  const expired = remainingMs <= 0;

  const approve = useApprovePendingAction();
  const reject = useRejectPendingAction();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const isWorking = approve.isPending || reject.isPending;
  // Lock the buttons once the backend confirmed a terminal status.
  const isTerminal =
    action.status !== 'PENDING' || expired;

  const handleApprove = () => {
    if (isTerminal || isWorking) return;
    approve.mutate(
      { id: action.id, conversationId: action.conversationId },
      {
        onSuccess: () => toast.success('Ação aprovada'),
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : 'Erro ao aprovar ação';
          toast.error(message);
        },
      },
    );
  };

  const submitReject = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('Informe o motivo da rejeição');
      return;
    }
    reject.mutate(
      { id: action.id, reason: trimmed, conversationId: action.conversationId },
      {
        onSuccess: () => {
          toast.success('Ação rejeitada');
          setRejectOpen(false);
          setReason('');
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : 'Erro ao rejeitar ação';
          toast.error(message);
        },
      },
    );
  };

  const toolLabel = TOOL_LABELS[action.toolName] ?? action.toolName;
  const Icon = style.Icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className={`rounded-lg border p-4 shadow-sm ${style.card}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.iconWrap}`}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}
            >
              {toolLabel}
            </span>
            <span
              className={`inline-flex items-center rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-black dark:text-zinc-300 dark:ring-zinc-700`}
            >
              Impacto:{' '}
              {{ low: 'baixo', medium: 'médio', high: 'alto', critical: 'crítico' }[
                action.preview.impact
              ] ?? action.preview.impact}
            </span>
            <span
              className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${
                expired
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-zinc-600 dark:text-zinc-300'
              }`}
              title={`Expira em ${new Date(action.expiresAt).toLocaleString('pt-BR')}`}
            >
              <Clock className="h-3.5 w-3.5" />
              {formatCountdown(remainingMs)}
            </span>
          </div>

          <p className="mt-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {describeAction(action)}
          </p>

          {action.toolName === 'setMetaAdsStatus' &&
            (action.args?.status as string) === 'ACTIVE' && (
              <p className="mt-1.5 rounded-md bg-amber-100/80 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                ⚠️ Este é o passo que liga o anúncio: ao aprovar, ele começa a
                veicular e a gastar o orçamento definido.
              </p>
            )}

          {/* "Alvo: contact:<id>" era ruído em ação de marketing — esconde. */}
          {action.preview.affectedEntity &&
            !(action.preview.affectedEntity.label ?? '').startsWith('contact:') && (
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Alvo:{' '}
                <span className="font-medium">
                  {action.preview.affectedEntity.label ??
                    `${action.preview.affectedEntity.type}#${action.preview.affectedEntity.id}`}
                </span>
              </p>
            )}

          {(() => {
            const rows = formatArgs(action.args);
            if (rows.length === 0) return null;
            return (
              <dl className="mt-2 space-y-1 rounded-md bg-white/70 px-2.5 py-2 text-xs ring-1 ring-inset ring-zinc-200/70 dark:bg-black dark:ring-zinc-700/60">
                {rows.map(({ k, v, technical }, i) => (
                  <div key={`${k}-${i}`} className="flex gap-2">
                    <dt
                      className={`shrink-0 ${
                        technical
                          ? 'text-[10px] text-zinc-400 dark:text-zinc-500'
                          : 'font-medium text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {k}:
                    </dt>
                    <dd
                      className={`min-w-0 break-words ${
                        technical
                          ? 'font-mono text-[10px] text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            );
          })()}

          {action.preview.rollback && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold">Rollback:</span>{' '}
              {action.preview.rollback}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isTerminal || isWorking}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approve.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Aprovar
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              disabled={isTerminal || isWorking}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Rejeitar
            </button>
            {expired && action.status === 'PENDING' && (
              <span className="text-xs italic text-red-600 dark:text-red-400">
                Esta ação expirou e não pode mais ser aprovada.
              </span>
            )}
          </div>
        </div>
      </div>

      {rejectOpen && (
        <RejectReasonDialog
          working={reject.isPending}
          reason={reason}
          onChangeReason={setReason}
          onCancel={() => {
            if (reject.isPending) return;
            setRejectOpen(false);
            setReason('');
          }}
          onConfirm={submitReject}
        />
      )}
    </motion.div>
  );
}

/**
 * Lightweight modal mirroring `rename-conversation-dialog.tsx` styling so
 * it feels native to the inbox without pulling a heavier Dialog primitive.
 */
function RejectReasonDialog({
  working,
  reason,
  onChangeReason,
  onCancel,
  onConfirm,
}: {
  working: boolean;
  reason: string;
  onChangeReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) onCancel();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [working, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !working && onCancel()}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Rejeitar ação
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-4 py-4">
          <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
            Motivo
          </label>
          <p className="text-[11px] text-zinc-500">
            Fica registrado no histórico do agente. Ajuda a refinar prompts.
          </p>
          <textarea
            value={reason}
            onChange={(e) => onChangeReason(e.target.value)}
            disabled={working}
            rows={3}
            placeholder="Ex: cliente ainda não pagou, vou conferir o boleto antes."
            className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-100"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-white/10 dark:bg-black">
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={working || reason.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working && <Loader2 className="h-3 w-3 animate-spin" />}
            Confirmar rejeição
          </button>
        </div>
      </div>
    </div>
  );
}
