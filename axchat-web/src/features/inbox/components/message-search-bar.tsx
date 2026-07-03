'use client';

import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

interface MessageSearchBarProps {
  /** All messages currently displayed in the chat */
  messages: { id: string; content: { text?: string }; type: string }[];
  /** Called when a message should be scrolled into view */
  onJumpToMessage: (messageId: string) => void;
  /** Controlado: só aparece quando aberto (botão da lupa no cabeçalho). */
  open: boolean;
  onClose: () => void;
}

export function MessageSearchBar({ messages, onJumpToMessage, open, onClose }: MessageSearchBarProps) {
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Foca ao abrir; limpa quando fecha.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery('');
      setCurrentIndex(0);
    }
  }, [open]);

  // Clicar fora fecha a busca na hora. Ignora o próprio botão da lupa
  // (data-search-toggle) pra não brigar com o toggle.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current?.contains(target)) return;
      if (target.closest('[data-search-toggle]')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  const results = useMemo(() => {
    if (!query.trim()) return [] as { id: string; text: string; index: number }[];
    const q = query.toLowerCase();
    return messages
      .map((m, i) => ({
        id: m.id,
        text: (m.content?.text || '').toLowerCase(),
        index: i,
      }))
      .filter((m) => m.text.includes(q));
  }, [query, messages]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
  }, [results.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
  }, [results.length]);

  const handleJump = useCallback(() => {
    if (results[currentIndex]) {
      onJumpToMessage(results[currentIndex].id);
    }
  }, [results, currentIndex, onJumpToMessage]);

  if (!open) return null;

  return (
    <div ref={containerRef} className="flex items-center gap-1.5 border-b border-zinc-100 bg-white px-3 py-1.5 dark:border-white/5 dark:bg-black">
      <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        placeholder="Buscar mensagens..."
        className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
      />
      {results.length > 0 && (
        <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
          {currentIndex + 1}/{results.length}
        </span>
      )}
      {results.length > 0 && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { handlePrev(); handleJump(); }}
            className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { handleNext(); handleJump(); }}
            className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <button
        onClick={onClose}
        title="Fechar busca"
        className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
