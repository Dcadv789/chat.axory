'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bot, BarChart3, User, Sparkles, Wrench, Activity, ShieldCheck, PieChart, Grid3X3, GitBranch, Code2 } from 'lucide-react';
import { AgentsList } from '@/features/ai-agents/components/agents-list';
import { AgentsSectorView } from '@/features/ai-agents/components/agents-sector-view';
import { AgentsSectorFilterBar } from '@/features/ai-agents/components/agents-sector-filter-bar';
import type { SectorFilter } from '@/features/ai-agents/components/agents-sector-utils';
import { aiAgentsService } from '@/features/ai-agents/services/ai-agents.service';
import { agentSectorsService } from '@/features/ai-agents/services/agent-sectors.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { JarvisOverviewTab } from '@/features/ai-agents/components/jarvis/overview-tab';
import { JarvisAgentTab } from '@/features/ai-agents/components/jarvis/agent-tab';
import { JarvisSkillsTab } from '@/features/ai-agents/components/jarvis/skills-tab';
import { JarvisToolsTab } from '@/features/ai-agents/components/jarvis/tools-tab';
import { JarvisRunsTab } from '@/features/ai-agents/components/jarvis/runs-tab';
import { JarvisWatchdogTab } from '@/features/ai-agents/components/jarvis/watchdog-tab';
import { JarvisMetricsTab } from '@/features/ai-agents/components/jarvis/metrics-tab';
import { JarvisBuiltinToolsTab } from '@/features/ai-agents/components/jarvis/builtin-tools-tab';
import { useAuthStore } from '@/stores/auth-store';

type Tab = 'overview' | 'metrics' | 'agents' | 'skills' | 'tools' | 'agent' | 'runs' | 'watchdog' | 'builtin-tools';

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
    subtitle: 'Conexões custom (HTTP / SQL) da sua organização',
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
  'builtin-tools': {
    label: 'Tools do sistema',
    icon: Code2,
    subtitle: 'Tools nativas do backend — apenas leitura',
  },
};

const VALID_TABS: Tab[] = ['overview', 'metrics', 'agents', 'skills', 'tools', 'runs', 'watchdog', 'agent', 'builtin-tools'];

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
  const [sectorView, setSectorView] = useState(false);
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('all');
  const orgId = useOrgId();

  const { data: sectors = [] } = useQuery({
    queryKey: ['agent-sectors'],
    queryFn: () => agentSectorsService.list(),
    enabled: tab === 'agents',
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['ai-agents', orgId],
    queryFn: () => aiAgentsService.list(),
    enabled: tab === 'agents',
  });

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
        {tab === 'builtin-tools' && isSuperAdmin && <JarvisBuiltinToolsTab />}
        {tab === 'metrics' && <JarvisMetricsTab />}
        {tab === 'agents' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-end gap-2 border-b border-zinc-200 px-6 py-2 dark:border-white/10">
              <div className="inline-flex items-center rounded-md bg-zinc-100 p-0.5 dark:bg-black">
                <button
                  onClick={() => setSectorView(false)}
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    !sectorView
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Organograma
                </button>
                <button
                  onClick={() => setSectorView(true)}
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    sectorView
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                  Setores
                </button>
              </div>
            </div>
            <AgentsSectorFilterBar
              sectors={sectors}
              agents={agents}
              selectedFilter={sectorFilter}
              onSelectFilter={setSectorFilter}
            />
            {sectorView ? (
              <AgentsSectorView sectorFilter={sectorFilter} />
            ) : (
              <AgentsList sectorFilter={sectorFilter} />
            )}
          </div>
        )}
        {tab === 'skills' && <JarvisSkillsTab />}
        {tab === 'tools' && <JarvisToolsTab />}
        {tab === 'runs' && <JarvisRunsTab />}
        {tab === 'watchdog' && <JarvisWatchdogTab />}
        {tab === 'agent' && <JarvisAgentTab />}
      </div>
    </div>
  );
}
