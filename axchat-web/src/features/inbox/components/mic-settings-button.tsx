'use client';

import { CloseButton, Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { Check, Loader2, Settings2 } from 'lucide-react';
import type { AudioInputDevice } from '../hooks/use-audio-recorder';

interface MicSettingsButtonProps {
  devices: AudioInputDevice[];
  selectedDeviceId: string;
  isLoading: boolean;
  disabled?: boolean;
  buttonClassName?: string;
  onSelect: (deviceId: string) => void;
  onOpen: () => void;
}

export function MicSettingsButton({
  devices,
  selectedDeviceId,
  isLoading,
  disabled,
  buttonClassName,
  onSelect,
  onOpen,
}: MicSettingsButtonProps) {
  const btnClass =
    buttonClassName ||
    'rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-300';

  return (
    <Popover className="relative">
      <PopoverButton
        type="button"
        disabled={disabled}
        onClick={onOpen}
        title="Configurar microfone"
        className={btnClass}
        aria-label="Configurar microfone"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Settings2 className="h-5 w-5" />
        )}
      </PopoverButton>

      <PopoverPanel
        anchor="top end"
        className="z-50 w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg focus:outline-none dark:border-white/10 dark:bg-black"
      >
        <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Microfone
        </p>

        {isLoading ? (
          <p className="px-2 py-3 text-sm text-zinc-500">Carregando dispositivos…</p>
        ) : devices.length === 0 ? (
          <p className="px-2 py-3 text-sm text-zinc-500">
            Nenhum microfone encontrado. Verifique as permissões do navegador.
          </p>
        ) : (
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {devices.map((device) => {
              const selected = device.deviceId === selectedDeviceId;
              return (
                <li key={device.deviceId}>
                  <CloseButton
                    as="button"
                    type="button"
                    onClick={() => onSelect(device.deviceId)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      selected
                        ? 'bg-primary/10 text-primary dark:bg-primary/15'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10'
                    }`}
                  >
                    <span className="flex-1 truncate">{device.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </CloseButton>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverPanel>
    </Popover>
  );
}
