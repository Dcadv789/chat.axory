'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, CheckCircle2, Clock, XCircle, Loader2, Smartphone, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { channelsService, type WhatsappTemplate } from '@/features/channels/services/channels.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { MetaIcon } from '@/components/ui/icons';

const statusConfig: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  APPROVED: { label: 'Aprovado', icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' },
  PENDING: { label: 'Pendente', icon: Clock, cls: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' },
  REJECTED: { label: 'Rejeitado', icon: XCircle, cls: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20' },
};

export default function WhatsappTemplatesPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);

  // Fetch all whatsapp official channels
  const { data: channels = [], isLoading: loadingChannels } = useQuery({
    queryKey: ['channels', orgId, 'WHATSAPP_OFFICIAL'],
    queryFn: async () => {
      const all = await channelsService.list();
      return all.filter((ch) => ch.type === 'WHATSAPP_OFFICIAL');
    },
  });

  // Fetch templates for a specific channel
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const selectedChannel = channels.find((ch) => ch.id === selectedChannelId) || channels[0];

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['whatsapp-templates', selectedChannel?.id],
    queryFn: () => selectedChannel?.id ? channelsService.listWhatsappTemplates(selectedChannel.id) : Promise.resolve([]),
    enabled: !!selectedChannel?.id,
  });

  const handleSync = async (channelId: string) => {
    setSyncingChannelId(channelId);
    try {
      const result = await channelsService.syncWhatsappTemplates(channelId);
      toast.success(`${result.synced} de ${result.total} templates sincronizados`);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates', channelId] });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao sincronizar templates');
    } finally {
      setSyncingChannelId(null);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // When channels load, auto-select the first one
  if (channels.length > 0 && !selectedChannelId) {
    setSelectedChannelId(channels[0].id);
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {loadingChannels ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Smartphone className="h-12 w-12 text-zinc-200 dark:text-zinc-700" />
          <p className="mt-3 text-sm text-zinc-500">Nenhum canal WhatsApp Official configurado</p>
          <p className="text-xs text-zinc-400 mt-1">
            Adicione um canal WhatsApp Official em{' '}
            <a href="/settings/channels" className="text-primary hover:underline">
              Canais
            </a>
          </p>
        </div>
      ) : (
        <>
          {/* Seletor de canal */}
          <div className="flex flex-wrap items-center gap-2">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setSelectedChannelId(ch.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedChannel?.id === ch.id
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-400 dark:hover:bg-white/5'
                }`}
              >
                <MetaIcon className="h-4 w-4" />
                {ch.name}
              </button>
            ))}
          </div>

          {selectedChannel && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {templates.length} template{templates.length !== 1 ? 's' : ''} sincronizado{templates.length !== 1 ? 's' : ''}
                {' — '}último sync: {templates.length > 0 ? formatDate(templates[0].syncedAt) : 'nunca'}
              </p>
              <button
                onClick={() => handleSync(selectedChannel.id)}
                disabled={syncingChannelId === selectedChannel.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingChannelId === selectedChannel.id ? 'animate-spin' : ''}`} />
                Sincronizar
              </button>
            </div>
          )}

          {/* Tabela de templates */}
          <div className="mt-4 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
            <table className="w-full table-fixed shrink-0">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
                  <th className="w-[25%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Nome</th>
                  <th className="w-[15%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Categoria</th>
                  <th className="w-[12%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Idioma</th>
                  <th className="w-[15%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</th>
                  <th className="w-[18%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">ID Meta</th>
                  <th className="w-[15%] px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">Ações</th>
                </tr>
              </thead>
            </table>
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[25%]" />
                  <col className="w-[15%]" />
                  <col className="w-[12%]" />
                  <col className="w-[15%]" />
                  <col className="w-[18%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <tbody>
                  {loadingTemplates ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-300" />
                      </td>
                    </tr>
                  ) : templates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <Clock className="mx-auto h-10 w-10 text-zinc-200 dark:text-zinc-700" />
                        <p className="mt-3 text-sm text-zinc-500">Nenhum template encontrado</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Clique em <strong>Sincronizar</strong> para buscar os templates da Meta
                        </p>
                      </td>
                    </tr>
                  ) : (
                    templates.map((tmpl: WhatsappTemplate) => {
                      const st = statusConfig[tmpl.status] || statusConfig.PENDING;
                      const StatusIcon = st.icon;
                      return (
                        <tr key={tmpl.id} className="border-b border-zinc-50 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/10">
                          <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {tmpl.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 truncate">
                            {tmpl.category}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 truncate uppercase">
                            {tmpl.language}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                              <StatusIcon className="h-3 w-3" />
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-400 truncate font-mono">
                            {tmpl.metaTemplateId}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {tmpl.status === 'PENDING' && (
                              <span className="text-[11px] text-zinc-400 italic">
                                Aguardando revisão
                              </span>
                            )}
                            {tmpl.status === 'APPROVED' && (
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                ✓ Pronto para uso
                              </span>
                            )}
                            {tmpl.status === 'REJECTED' && (
                              <a
                                href={`https://business.facebook.com/wa/manage/message-templates/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              >
                                Revisar no Meta
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
