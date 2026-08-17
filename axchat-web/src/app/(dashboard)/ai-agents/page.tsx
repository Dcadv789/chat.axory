'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, BarChart3, User, Sparkles, Wrench, Activity, ShieldCheck, PieChart, Grid3X3, GitBranch, Headset, Megaphone, Building2, UserCog, Plus, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import type { AgentSector } from '@/features/ai-agents/services/ai-agents.service';
import { AgentsList } from '@/features/ai-agents/components/agents-list';
import { AgentsSplitView } from '@/features/ai-agents/components/agents-split-view';
import { CreateAgentDialog } from '@/features/ai-agents/components/create-agent-dialog';
import { FiltroDeDepartamento } from '@/features/ai-agents/components/filtro-departamento';
import { JarvisOverviewTab } from '@/features/ai-agents/components/jarvis/overview-tab';
import { JarvisAgentTab } from '@/features/ai-agents/components/jarvis/agent-tab';
import { JarvisSkillsTab } from '@/features/ai-agents/components/jarvis/skills-tab';
import { JarvisToolsTab } from '@/features/ai-agents/components/jarvis/tools-tab';
import { JarvisRunsTab } from '@/features/ai-agents/components/jarvis/runs-tab';
import { JarvisWatchdogTab } from '@/features/ai-agents/components/jarvis/watchdog-tab';
import { JarvisMetricsTab } from '@/features/ai-agents/components/jarvis/metrics-tab';
import { useAuthStore } from '@/stores/auth-store';

type Tab = 'overview' | 'metrics' | 'agents' | 'skills' | 'tools' | 'agent' | 'runs' | 'watchdog';

/** Frente vinda da URL → rótulo e valor do enum do backend. */
const SECTOR_LABELS: Record<
  string,
  { label: string; icon: React.ElementType; enum: AgentSector }
> = {
  atendimento: { label: 'Atendimento', icon: Headset, enum: 'ATENDIMENTO' },
  marketing: { label: 'Marketing', icon: Megaphone, enum: 'MARKETING' },
  operacao: { label: 'Operação', icon: Building2, enum: 'OPERACAO' },
  pessoal: { label: 'Pessoal', icon: UserCog, enum: 'PESSOAL' },
};

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
  const [sectorView, setSectorView] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  // Ponte organograma -> Departamentos: o botão Editar do resumo troca de
  // visão e abre o formulário no agente clicado.
  const [editarAgenteId, setEditarAgenteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Setor vindo da URL (sidebar) — padrão é atendimento
  const sector = searchParams.get('sector') || 'atendimento';
  const sectorMeta = SECTOR_LABELS[sector] ?? SECTOR_LABELS.atendimento;
  const agentSector: AgentSector = sectorMeta.enum;

  // Trocar de frente na sidebar NÃO remonta esta página — muda só a query.
  // Sem zerar o filtro, um departamento escolhido em Atendimento (SUPORTE,
  // VENDAS…) continuava valendo em Marketing, onde ninguém tem esse
  // departamento, e a tela aparecia vazia como se não houvesse agente.
  useEffect(() => {
    setDeptFilter(null);
  }, [agentSector]);

  useEffect(() => {
    if (raw === 'overview' && !isSuperAdmin) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'metrics');
      router.replace(`/ai-agents?${params.toString()}`);
    }
  }, [isSuperAdmin, raw, router, searchParams]);

  return (
    <PageHeader
      icon={meta.icon as LucideIcon}
      title={meta.label}
      subtitle={meta.subtitle}
      breadcrumb={[{ label: sectorMeta.label, href: `/ai-agents?sector=${sector}` }]}
      contentClassName="flex min-h-0 flex-1 flex-col px-4 pt-3"
    >
      <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === 'overview' && isSuperAdmin && <JarvisOverviewTab agentSector={agentSector} />}
        {tab === 'metrics' && <JarvisMetricsTab agentSector={agentSector} />}
        {tab === 'agents' && (
          <div className="flex h-full flex-col">
            {/* Uma barra só: filtro, modo de exibição e criar. Antes eram duas
                faixas empilhadas — o botão de criar numa, os departamentos na
                outra — e o alternador de visão numa terceira, dentro da página. */}
            <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black">
              <FiltroDeDepartamento
                agentSector={agentSector}
                valor={deptFilter}
                onChange={setDeptFilter}
              />

              <span className="mx-1 hidden h-6 w-px bg-zinc-200 sm:block dark:bg-white/10" />

              <div className="inline-flex shrink-0 items-center rounded-md bg-zinc-100 p-0.5 dark:bg-white/5">
                {[
                  { ativo: !sectorView, ir: () => setSectorView(false), icone: GitBranch, label: 'Organograma' },
                  { ativo: sectorView, ir: () => setSectorView(true), icone: Grid3X3, label: 'Departamentos' },
                ].map((m) => (
                  <button
                    key={m.label}
                    onClick={m.ir}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      m.ativo
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                    }`}
                  >
                    <m.icone className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCriando(true)}
                className="ml-auto inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Novo agente
              </button>
            </div>

            {sectorView ? (
              <>
                <AgentsSplitView
                  agentSector={agentSector}
                  deptFilter={deptFilter}
                  abrirAgenteId={editarAgenteId}
                  abrirEditando={!!editarAgenteId}
                  onAberto={() => setEditarAgenteId(null)}
                />
                {/* Na visão de setores a criação é da página, porque o botão
                    está na barra. No organograma quem cuida é o AgentsList. */}
                <CreateAgentDialog
                  open={criando}
                  onClose={() => setCriando(false)}
                  onCreated={() =>
                    queryClient.invalidateQueries({ queryKey: ['ai-agents'] })
                  }
                  defaultSector={agentSector}
                />
              </>
            ) : (
              <AgentsList
                agentSector={agentSector}
                deptFilter={deptFilter}
                abrirCriacao={criando}
                onFecharCriacao={() => setCriando(false)}
                onEditarAgente={(a) => {
                  setEditarAgenteId(a.id);
                  setSectorView(true);
                }}
              />
            )}
          </div>
        )}
        {tab === 'skills' && <JarvisSkillsTab />}
        {tab === 'tools' && <JarvisToolsTab />}
        {tab === 'runs' && <JarvisRunsTab agentSector={agentSector} />}
        {tab === 'watchdog' && <JarvisWatchdogTab agentSector={agentSector} />}
        {tab === 'agent' && <JarvisAgentTab agentSector={agentSector} />}
      </div>
    </PageHeader>
  );
}
