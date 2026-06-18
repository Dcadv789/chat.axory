'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Mic, Trash2, Square, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAudioRecorder } from '../hooks/use-audio-recorder';
import { MicSettingsButton } from './mic-settings-button';

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  onSendAudio?: (blob: Blob) => Promise<void>;
  onSendFile?: (file: File) => Promise<void>;
  disabled?: boolean;
}

const FILE_ACCEPT = [
  'image/*',
  'video/*',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.zip',
].join(',');

const TEXTAREA_MIN_HEIGHT = 56;
const TEXTAREA_MAX_HEIGHT = 168;
/** ~5× a altura extra que havia antes (168→320); cap em 55% da tela. */
const TEXTAREA_EXPANDED_MAX_HEIGHT = 900;
const TEXTAREA_EXPANDED_MIN_HEIGHT = 280;

function expandedTextareaMaxHeight(): number {
  if (typeof window === 'undefined') return TEXTAREA_EXPANDED_MAX_HEIGHT;
  return Math.min(TEXTAREA_EXPANDED_MAX_HEIGHT, Math.round(window.innerHeight * 0.55));
}

/** Espaço reservado na caixa para a barra de ações (invisível pro texto). */
const COMPOSER_ACTIONS_RESERVE = 'pb-11';
const COMPOSER_EXPAND_RESERVE = 'pr-9';

const composerActionBtn =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200';

const composerShell =
  'relative w-full rounded-2xl border border-zinc-200 bg-zinc-50 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary dark:border-white/10 dark:bg-black';

function AudioPreview({ blob, onSend, onDiscard, isSending }: {
  blob: Blob;
  onSend: () => void;
  onDiscard: () => void;
  isSending: boolean;
}) {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setAudioSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <button
        onClick={onDiscard}
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-white/10"
        aria-label="Descartar áudio"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {audioSrc ? (
        <audio controls src={audioSrc} className="h-9 min-w-0 flex-1" />
      ) : (
        <div className="h-9 flex-1" />
      )}
      <button
        onClick={onSend}
        disabled={isSending}
        type="button"
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        aria-label="Enviar áudio"
      >
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Enviar
      </button>
    </div>
  );
}

export function ChatInput({ onSend, onSendAudio, onSendFile, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSendingAudio, setIsSendingAudio] = useState(false);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();
  const canRecord = !!onSendAudio;

  const handleOpenMicSettings = useCallback(() => {
    void recorder.refreshDevices(true);
  }, [recorder.refreshDevices]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxHeight = isExpanded ? expandedTextareaMaxHeight() : TEXTAREA_MAX_HEIGHT;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [isExpanded]);

  useEffect(() => {
    resizeTextarea();
  }, [isExpanded, text, resizeTextarea]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    try {
      await onSend(trimmed);
      setText('');
      resizeTextarea();
    } finally {
      setIsSending(false);
    }
  }, [text, isSending, onSend, resizeTextarea]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    resizeTextarea();
  };

  const handleSendAudio = useCallback(async () => {
    if (!recorder.blob || !onSendAudio) return;
    if (recorder.blob.size < 200) {
      toast.error('Nenhum áudio capturado. Escolha outro microfone nas configurações.');
      return;
    }
    setIsSendingAudio(true);
    try {
      await onSendAudio(recorder.blob);
      recorder.reset();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Erro ao enviar áudio',
      );
    } finally {
      setIsSendingAudio(false);
    }
  }, [recorder, onSendAudio]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !onSendFile) return;
      setIsSendingFile(true);
      try {
        await onSendFile(file);
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || err?.message || 'Erro ao enviar arquivo',
        );
      } finally {
        setIsSendingFile(false);
      }
    },
    [onSendFile],
  );

  const formatElapsed = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const micControls = canRecord ? (
    <>
      <button
        onClick={() => void recorder.start()}
        type="button"
        className={composerActionBtn}
        aria-label="Gravar áudio"
      >
        <Mic className="h-5 w-5" />
      </button>
      <MicSettingsButton
        devices={recorder.devices}
        selectedDeviceId={recorder.selectedDeviceId}
        isLoading={recorder.isLoadingDevices}
        disabled={recorder.state === 'recording'}
        onSelect={recorder.selectDevice}
        onOpen={handleOpenMicSettings}
        buttonClassName={composerActionBtn}
      />
    </>
  ) : null;

  if (disabled) {
    return (
      <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-[#171717]">
        Conversa encerrada — reabra para enviar mensagens
      </div>
    );
  }

  if (recorder.state === 'recording') {
    const levelPct = Math.min(100, Math.round(recorder.audioLevel * 100));

    return (
      <div className="border-t border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-black">
        <div className={`${composerShell} border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-500/10`}>
          <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            onClick={recorder.cancel}
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20"
            aria-label="Cancelar gravação"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="font-medium tabular-nums">{formatElapsed(recorder.elapsedMs)}</span>
              <span className="text-xs opacity-70">Gravando…</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-red-200/70 dark:bg-red-900/40">
              <div
                className="h-full rounded-full bg-red-500 transition-[width] duration-100"
                style={{ width: `${Math.max(4, levelPct)}%` }}
              />
            </div>
          </div>
          <button
            onClick={recorder.stop}
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600"
            aria-label="Parar gravação"
          >
            <Square className="h-4 w-4" />
          </button>
          </div>
        </div>
      </div>
    );
  }

  if (recorder.state === 'stopped' && recorder.blob) {
    return (
      <div className="border-t border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-black">
        <div className={composerShell}>
          <AudioPreview
          blob={recorder.blob}
          onSend={() => void handleSendAudio()}
          onDiscard={recorder.cancel}
          isSending={isSendingAudio}
        />
        </div>
        {recorder.error && (
          <p className="mt-1 text-xs text-red-500">{recorder.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-black">
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        onChange={handleFileChange}
        className="hidden"
      />

      <div className={composerShell}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Digite uma mensagem..."
          rows={2}
          style={{
            minHeight: isExpanded ? TEXTAREA_EXPANDED_MIN_HEIGHT : TEXTAREA_MIN_HEIGHT,
            maxHeight: isExpanded ? expandedTextareaMaxHeight() : TEXTAREA_MAX_HEIGHT,
          }}
          className={`block w-full resize-none border-0 bg-transparent px-3 pt-3 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0 dark:text-zinc-100 ${COMPOSER_ACTIONS_RESERVE} ${COMPOSER_EXPAND_RESERVE}`}
        />

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="absolute right-2 top-2 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-200/80 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
          aria-label={isExpanded ? 'Reduzir campo de mensagem' : 'Expandir campo de mensagem'}
          title={isExpanded ? 'Reduzir' : 'Expandir'}
        >
          {isExpanded ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>

        <div className="absolute bottom-1.5 left-2 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!onSendFile || isSendingFile}
            className={composerActionBtn}
            aria-label="Anexar arquivo"
          >
            {isSendingFile ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </button>
        </div>

        <div className="absolute bottom-1.5 right-2 flex items-center gap-0.5">
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isSending}
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            aria-label="Enviar mensagem"
          >
            {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
          {micControls}
        </div>
      </div>

      {recorder.error && (
        <p className="mt-1.5 text-xs text-red-500">{recorder.error}</p>
      )}
    </div>
  );
}
