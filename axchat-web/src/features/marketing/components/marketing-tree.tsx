'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, Megaphone } from 'lucide-react';
import {
  MARKETING_TABS,
  MARKETING_TAB_PARAM,
  isMarketingTab,
  type MarketingTab,
} from '../marketing-tabs';

const STORAGE_KEY = 'marketing-tree-expanded';

/**
 * Árvore da sidebar do marketing. Segue o mesmo desenho de PipelinesTree e
 * InboxTree — chevron pra abrir/fechar, cabeçalho que leva à raiz, filhos
 * indentados com a barra à esquerda.
 *
 * As abas viraram destino de URL (`/marketing?aba=x`) pra existirem aqui: o
 * painel guardava a aba em estado local, então não havia como apontar pra ela
 * de fora, nem recarregar a página caindo onde se estava.
 */
export function MarketingTree() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  });

  const naArea = pathname === '/marketing';
  const param = searchParams.get(MARKETING_TAB_PARAM);
  // Sem `?aba=` a tela abre no Resumo — o destaque tem que dizer o mesmo.
  const abaAtiva: MarketingTab = isMarketingTab(param) ? param : 'resumo';

  const alternar = () => {
    const proximo = !expanded;
    setExpanded(proximo);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, proximo ? '1' : '0');
    }
  };

  const ir = (aba: MarketingTab) =>
    router.push(`/marketing?${MARKETING_TAB_PARAM}=${aba}`);

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
        <button
          type="button"
          onClick={() => ir('resumo')}
          className={`flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium ${
            naArea
              ? 'bg-zinc-950/5 text-zinc-950 dark:bg-white/5 dark:text-white'
              : 'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'
          }`}
        >
          <Megaphone className="size-5" />
          <span className="flex-1">Gestão de Marketing</span>
        </button>
      </div>

      {expanded && (
        <div className="ml-5 space-y-0.5 border-l border-zinc-200 pl-2 dark:border-white/10">
          {MARKETING_TABS.map((t) => {
            const ativa = naArea && abaAtiva === t.id;
            return (
              <div key={t.id}>
                {t.group && (
                  <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {t.group}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => ir(t.id)}
                  title={t.subtitle}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                    ativa
                      ? 'bg-zinc-950/5 font-medium text-zinc-900 dark:bg-white/5 dark:text-white'
                      : 'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white'
                  }`}
                >
                  <t.icon className="size-3.5 shrink-0 text-zinc-400" />
                  <span className="flex-1 truncate">{t.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
