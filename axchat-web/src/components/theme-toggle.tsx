'use client';

import { useEffect, useState } from 'react';
import { MonitorCog, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-500">
        <MonitorCog className="h-4 w-4" />
        Tema
      </span>
    );
  }

  const isDark = theme !== 'light';

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    localStorage.setItem('theme', nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{isDark ? 'Modo claro' : 'Modo escuro'}</span>
    </button>
  );
}
