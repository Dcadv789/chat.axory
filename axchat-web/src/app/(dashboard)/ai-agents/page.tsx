'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, BarChart3, User, Sparkles, Wrench, Activity, ShieldCheck, PieChart } from 'lucide-react';
import { AgentsList } from '@/features/ai-agents/components/agents-list';
import { JarvisOverviewTab } from '@/features/ai-agents/components/jarvis/overview-tab';
import { JarvisAgentTab } from '@/features/ai-agents/components/jarvis/agent-tab';
import { JarvisSkillsTab } from '@/features/ai-agents/components/jarvis/skills-tab';
import { JarvisToolsTab } from '@/features/ai-agents/components/jarvis/tools-tab';
import { JarvisRunsTab } from '@/features/ai-agents/components/jarvis/runs-tab';
import { JarvisWatchdogTab } from '@/features/ai-agents/components/jarvis/watchdog-tab';
import { JarvisMetricsTab } from '@/features/ai-agents/components/jarvis/metrics-tab';
import { useAuthStore } from '@/stores/auth-store';

type Tab = 'overview' | 'metrics' | 'agents' | 'skills' | 'tools' | 'agent' | 'runs' | 'watchdog';

const TAB_META: Record<Tab, { label: string; icon: React.ElementType; subtitle: string }> = {
  overview: {
    label: 'Visão geral',
    icon: BarChart3,
    subtitle: 'Custo, tokens, runs e qualidade — atualiza a cada 5s',
  },
  metrics: {
    label: 'Métricas Gerais',
    icon: PieChart,
    subtitle: 'Resultado do atendimento com IA no período selecionado',
  },
  agents: {
    label: 'Agentes',
    icon: Bot,
    subtitle: 'Hierarquia matricial — quem reporta a quem, agrupado por departamento',
  },
  skills: {
    label: 'Skills',
    icon: Sparkles,
    subtitle: 'Bundles reutilizáveis de tools + instruções para os agentes',
  },
  tools: {
    label: 'Tools',
    icon: Wrench,
    subtitle: 'Providers reusáveis: HTTP API ou Postgres',
  },
  runs: {
    label: 'Execuções',
    icon: Activity,
    subtitle: 'Histórico de runs e skills chamadas — atualiza a cada 10s',
  },
  watchdog: {
    label: 'Watchdog',
    icon: ShieldCheck,
    subtitle: 'Monitor de conversas presas — refresh a cada 15s',
  },
  agent: {
    label: 'Por agente',
    icon: User,
    subtitle: 'Métricas e execuções por agente individual',
  },
};

const VALID_TABS: Tab[] = ['overview', 'metrics', 'agents', 'skills', 'tools', 'runs', 'watchdog', 'agent'];

export default function AiAgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSuperAdmin = useAuthStore((s) => !!s.user?.isSuperAdmin);
  const defaultTab: Tab = isSuperAdmin ? 'overview' : 'metrics';
  const raw = searchParams.get('tab') as Tab | null;
  const requestedTab = raw && VALID_TABS.includes(raw) ? raw : null;
  const tab: Tab = requestedTab === 'overview' && !isSuperAdmin ? 'metrics' : requestedTab ?? defaultTab;
  const meta = TAB_META[tab];
  const TabIcon = meta.icon;

  useEffect(() => {
    if (raw === 'overview' && !isSuperAdmin) {
      router.replace('/ai-agents?tab=metrics');
    }
  }, [isSuperAdmin, raw, router]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              <span>Jarvis</span>
              <span className="font-normal text-zinc-300 dark:text-zinc-600">/</span>
              <span className="inline-flex items-center gap-1.5">
                <TabIcon className="h-4 w-4 text-zinc-400" />
                {meta.label}
              </span>
            </h1>
            <p className="text-xs text-zinc-500">{meta.subtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && isSuperAdmin && <JarvisOverviewTab />}
        {tab === 'metrics' && <JarvisMetricsTab />}
        {tab === 'agents' && <AgentsList />}
        {tab === 'skills' && <JarvisSkillsTab />}
        {tab === 'tools' && <JarvisToolsTab />}
        {tab === 'runs' && <JarvisRunsTab />}
        {tab === 'watchdog' && <JarvisWatchdogTab />}
        {tab === 'agent' && <JarvisAgentTab />}
      </div>
    </div>
  );
}
