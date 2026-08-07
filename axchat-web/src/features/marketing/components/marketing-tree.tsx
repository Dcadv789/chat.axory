'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { MARKETING_SECTIONS, rotaDaSecao } from '../marketing-tabs';

const STORAGE_KEY = 'marketing-tree-expanded';

/**
 * Árvore da sidebar do marketing — só as SEÇÕES. As abas de cada seção ficam
 * na barra horizontal da página; repetir as dez aqui era duplicar na lateral a
 * mesma lista que já estava no topo.
 *
 * Clicar numa seção leva à primeira aba dela.
 */
export function MarketingTree() {
  const pathname = usePathname();

  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  });

  const naArea = !!pathname?.startsWith('/marketing');
  // `/marketing` sem segmento é o Resumo — o destaque tem que dizer o mesmo.
  const secaoAtiva = pathname === '/marketing' ? 'resumo' : pathname?.split('/')[2];

  const alternar = () => {
    const proximo = !expanded;
    setExpanded(proximo);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, proximo ? '1' : '0');
    }
  };

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={alternar}
          aria-label={expanded ? 'Recolher' : 'Expandir'}
          className="flex h-7 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-300"
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <Link
          href={rotaDaSecao('resumo')}
          className={`flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium ${
            naArea
              ? 'bg-zinc-950/5 text-zinc-950 dark:bg-white/5 dark:text-white'
              : 'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'
          }`}
        >
          <Megaphone className="size-5" />
          <span className="flex-1">Gestão de Marketing</span>
        </Link>
      </div>

      {expanded && (
        <div className="ml-5 space-y-0.5 border-l border-zinc-200 pl-2 dark:border-white/10">
          {MARKETING_SECTIONS.map((s) => {
            const ativa = naArea && secaoAtiva === s.id;
            return (
              <Link
                key={s.id}
                href={rotaDaSecao(s.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                  ativa
                    ? 'bg-zinc-950/5 font-medium text-zinc-900 dark:bg-white/5 dark:text-white'
                    : 'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white'
                }`}
              >
                <s.icon className="size-3.5 shrink-0 text-zinc-400" />
                <span className="flex-1 truncate">{s.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
