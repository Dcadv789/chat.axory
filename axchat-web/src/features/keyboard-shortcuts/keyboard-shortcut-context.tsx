'use client';

import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode } from 'react';

type ShortcutAction =
  | 'focus-search'
  | 'focus-conversation-list'
  | 'toggle-agent-logs'
  | 'toggle-contact-sidebar';

type ShortcutMap = Partial<Record<ShortcutAction, () => void>>;

const ShortcutContext = createContext<{
  register: (action: ShortcutAction, handler: () => void) => () => void;
}>({
  register: () => () => {},
});

export function useShortcut(action: ShortcutAction, handler: () => void) {
  const { register } = useContext(ShortcutContext);
  useEffect(() => register(action, handler), [register, action, handler]);
}

const KEY_MAP: Record<string, ShortcutAction> = {
  'ctrl+k': 'focus-search',
  'ctrl+shift+c': 'focus-conversation-list',
  'ctrl+shift+m': 'toggle-agent-logs',
  'ctrl+shift+i': 'toggle-contact-sidebar',
};

export function KeyboardShortcutProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Map<ShortcutAction, () => void>>(new Map());

  const register = useCallback((action: ShortcutAction, handler: () => void) => {
    handlersRef.current.set(action, handler);
    return () => {
      handlersRef.current.delete(action);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in a contenteditable/input
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;

      // Always allow escape globally
      if (e.key === 'Escape') {
        handlersRef.current.get('focus-search')?.();
        return;
      }

      // For ctrl+ shortcuts, check if we should handle them
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      let shortcutKey = '';
      if (ctrl && shift) shortcutKey = `ctrl+shift+${key}`;
      else if (ctrl) shortcutKey = `ctrl+${key}`;

      const action = KEY_MAP[shortcutKey];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        handlersRef.current.get(action)?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ShortcutContext.Provider value={{ register }}>
      {children}
    </ShortcutContext.Provider>
  );
}
