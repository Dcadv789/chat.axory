'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Radio, ChevronRight } from 'lucide-react';
import { channelsService } from '../services/channels.service';
import { CreateChannelDialog } from './create-channel-dialog';
import { ChannelDetailPanel } from './channel-detail-panel';
import { useOrgId } from '@/hooks/use-org-query-key';
import { ZappfyIcon, MetaIcon, InstagramIcon, TelegramIcon } from '@/components/ui/icons';
import type { Channel } from '../services/channels.service';

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP_ZAPPFY: ZappfyIcon,
  WHATSAPP_OFFICIAL: MetaIcon,
  INSTAGRAM: InstagramIcon,
  TELEGRAM: TelegramIcon,
};

const channelTypeLabel: Record<string, string> = {
  WHATSAPP_ZAPPFY: 'WhatsApp (Zappfy)',
  WHATSAPP_OFFICIAL: 'WhatsApp Official',
  INSTAGRAM: 'Instagram',
  TELEGRAM: 'Telegram',
};

export function ChannelsList() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const queryClient = useQueryClient();
  const orgId = useOrgId();

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels', orgId],
    queryFn: () => channelsService.list(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['channels'] });

  return (
    <div className="flex w-full items-start gap-4">
      {/* Left sidebar: list — alinhado com a nav de cima (sem margem extra) */}
      <div className="flex w-72 shrink-0 flex-col border-r border-zinc-200 pr-4 dark:border-white/10">
        <div className="pb-3">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo Canal
          </button>
        </div>

        <div className="max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-50 dark:bg-black" />
              ))}
            </div>
          ) : !channels?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Radio className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Nenhum canal configurado
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Conectar Canal
              </button>
            </div>
          ) : (
            <div className="space-y-1 pb-4">
              {channels.map((ch) => {
                const Icon = channelIcons[ch.type] || Radio;
                const isSelected = selectedChannel?.id === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChannel(ch)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-primary/[0.06] text-primary dark:bg-primary/10'
                        : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/60 bg-white dark:border-white/10 dark:bg-black">
                      <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-zinc-500 dark:text-zinc-400'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{ch.name}</span>
                        <span
                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                            ch.isActive ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
                          }`}
                          title={ch.isActive ? 'Ativo' : 'Inativo'}
                        />
                      </div>
                      <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                        {channelTypeLabel[ch.type] || ch.type}
                      </p>
                    </div>
                    {isSelected && <ChevronRight className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right side: detail panel — alinhado à direita com a nav de cima */}
      <div className="min-w-0 flex-1">
        {selectedChannel ? (
          <ChannelDetailPanel
            key={selectedChannel.id}
            channel={selectedChannel}
            onUpdate={refresh}
            onSelect={setSelectedChannel}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 py-20 text-center dark:border-white/10">
            <Radio className="h-14 w-14 text-zinc-200 dark:text-zinc-700" />
            <h2 className="mt-4 text-lg font-semibold text-zinc-500 dark:text-zinc-400">
              Selecione um canal
            </h2>
            <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
              Escolha um canal à esquerda para ver suas configurações
            </p>
          </div>
        )}
      </div>

      <CreateChannelDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { refresh(); setShowCreate(false); }}
      />
    </div>
  );
}
