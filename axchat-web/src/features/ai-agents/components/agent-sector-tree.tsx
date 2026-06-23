'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  BarChart3,
  PieChart,
  Sparkles,
  Wrench,
  Activity,
  User,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

const STORAGE_KEY_PREFIX = 'agent-tree-';

const TABS: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'overview', label: 'Visão geral', icon: BarChart3 },
  { id: 'metrics', label: 'Métricas Gerais', icon: PieChart },
  { id: 'agents', label: 'Agentes', icon: Bot },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'runs', label: 'Execuções', icon: Activity },
  { id: 'watchdog', label: 'Watchdog', icon: ShieldCheck },
  { id: 'agent', label: 'Por agente', icon: User },
];

interface Props {
  label: string;
  icon: LucideIcon;
  sector: string; // 'atendimento' | 'marketing' | etc.
}

/**
 * Sidebar tree for a specific agent sector. Multiple instances can coexist
 * in the sidebar — each one filters the /ai-agents page by its sector.
 */
export function AgentSectorTree({ label, icon: TreeIcon, sector }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSuperAdmin = useAuthStore((s) => !!s.user?.isSuperAdmin);
  const storageKey = `${STORAGE_KEY_PREFIX}${sector}-expanded`;

  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(storageKey) !== '0';
  });

  const isAiAgents = pathname?.startsWith('/ai-agents');
  const currentSector = searchParams.get('sector') || null;
  const isActiveForThisSector = isAiAgents && currentSector === sector;

  // Remove overview for non-superadmin
  const visibleTabs = isSuperAdmin
    ? TABS
    : TABS.filter((tab) => tab.id !== 'overview');

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, next ? '1' : '0');
    }
  };

  const defaultTab = isSuperAdmin ? 'overview' : 'metrics';
  const goRoot = () => router.push(`/ai-agents?tab=${defaultTab}&sector=${sector}`);
  const goTab = (tabId: string) => router.push(`/ai-agents?tab=${tabId}&sector=${sector}`);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={toggleExpanded}
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
          onClick={goRoot}
          className={`flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium ${
            isActiveForThisSector
              ? 'bg-zinc-950/5 text-zinc-950 dark:bg-white/5 dark:text-white'
              : 'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'
          }`}
        >
          <TreeIcon className="size-5" />
          <span className="flex-1">{label}</span>
        </button>
      </div>

      {expanded && (
        <div className="ml-5 space-y-0.5 border-l border-zinc-200 pl-2 dark:border-white/10">
          {visibleTabs.map((t) => {
            const TabIcon = t.icon;
            const isActive =
              isActiveForThisSector && searchParams.get('tab') === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                  isActive
                    ? 'bg-zinc-950/5 font-medium text-zinc-900 dark:bg-white/5 dark:text-white'
                    : 'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white'
                }`}
              >
                <TabIcon className="size-3.5 text-zinc-400" />
                <span className="flex-1">{t.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
