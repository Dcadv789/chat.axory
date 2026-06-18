'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  RefreshCw,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { channelsService, type WhatsappTemplate } from '@/features/channels/services/channels.service';

interface WhatsappTemplateSelectorProps {
  channelId: string;
  channelType?: string;
  /** Called when user selects a template and fills the params */
  onSendTemplate: (template: WhatsappTemplate, params: Record<string, string>) => void;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  APPROVED: 'text-emerald-600 dark:text-emerald-400',
  PENDING: 'text-amber-600 dark:text-amber-400',
  REJECTED: 'text-red-600 dark:text-red-400',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  APPROVED: <CheckCircle2 className="h-3.5 w-3.5" />,
  PENDING: <Clock className="h-3.5 w-3.5" />,
  REJECTED: <AlertTriangle className="h-3.5 w-3.5" />,
};

export function WhatsappTemplateSelector({
  channelId,
  channelType,
  onSendTemplate,
  onClose,
}: WhatsappTemplateSelectorProps) {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsappTemplate | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});

  const {
    data: templates = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['whatsapp-templates', channelId],
    queryFn: () => channelsService.listWhatsappTemplates(channelId),
    enabled: !!channelId,
  });

  const approved = templates.filter((t) => t.status === 'APPROVED');
  const pending = templates.filter((t) => t.status === 'PENDING');
  const rejected = templates.filter((t) => t.status === 'REJECTED');

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await channelsService.syncWhatsappTemplates(channelId);
      toast.success(`${result.synced} templates sincronizados`);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const handleSelect = (t: WhatsappTemplate) => {
    setSelectedTemplate(t);
    // Extract body text placeholders {{1}}, {{2}} etc
    const bodyComponent = t.components?.find((c: any) => c.type === 'BODY');
    const placeholders = bodyComponent?.example?.body_text?.[0] || [];

    const initialParams: Record<string, string> = {};
    placeholders.forEach((_: string, i: number) => {
      initialParams[`param_${i + 1}`] = '';
    });
    setParamValues(initialParams);
  };

  const handleSend = () => {
    if (!selectedTemplate) return;
    onSendTemplate(selectedTemplate, paramValues);
    onClose();
  };

  const placeholderCount = Object.keys(paramValues).length;

  if (!channelType?.startsWith('WHATSAPP')) {
    return (
      <div className="p-4 text-center text-xs text-zinc-400">
        Templates disponíveis apenas para WhatsApp
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 dark:border-white/10">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Templates WhatsApp
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-300"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : selectedTemplate ? (
          /* Parameter form for selected template */
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSelectedTemplate(null)}
              className="text-[11px] text-primary hover:underline"
            >
              &larr; Voltar para lista
            </button>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {selectedTemplate.name}
              </p>
              <p className="text-[11px] text-zinc-400">
                {selectedTemplate.category} &middot; {selectedTemplate.language}
              </p>
            </div>

            {placeholderCount > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Preencha os parâmetros:
                </p>
                {Object.keys(paramValues).map((key, i) => (
                  <input
                    key={key}
                    type="text"
                    value={paramValues[key]}
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    placeholder={`Parâmetro ${i + 1}`}
                    className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-black dark:text-zinc-100"
                  />
                ))}
              </div>
            )}

            {placeholderCount === 0 && (
              <p className="text-xs text-zinc-400">
                Este template não possui parâmetros. Será enviado diretamente.
              </p>
            )}

            <button
              type="button"
              onClick={handleSend}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar template
            </button>
          </div>
        ) : templates.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="mb-2 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Nenhum template
            </p>
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              Clique em "Sincronizar" para buscar da Meta
            </p>
          </div>
        ) : (
          /* Template list grouped by status */
          <div className="space-y-4">
            {approved.length > 0 && (
              <TemplateGroup
                label="Aprovados"
                templates={approved}
                onSelect={handleSelect}
              />
            )}
            {pending.length > 0 && (
              <TemplateGroup
                label="Pendentes"
                templates={pending}
                onSelect={handleSelect}
              />
            )}
            {rejected.length > 0 && (
              <TemplateGroup
                label="Rejeitados"
                templates={rejected}
                onSelect={handleSelect}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateGroup({
  label,
  templates,
  onSelect,
}: {
  label: string;
  templates: WhatsappTemplate[];
  onSelect: (t: WhatsappTemplate) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label} ({templates.length})
      </p>
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t)}
          className="w-full rounded-md border border-zinc-100 bg-white px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:border-white/5 dark:bg-black/50 dark:hover:bg-white/5"
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {t.name}
            </p>
            <span
              className={`inline-flex items-center gap-1 text-[10px] ${STATUS_COLORS[t.status] || 'text-zinc-400'}`}
            >
              {STATUS_ICONS[t.status]}
              {t.status}
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            {t.category} &middot; {t.language}
          </p>
        </button>
      ))}
    </div>
  );
}
