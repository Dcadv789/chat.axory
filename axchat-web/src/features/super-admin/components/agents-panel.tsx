'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Building2,
  Copy,
  CopyCheck,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  type SuperAdminAgent,
  type SuperAdminOrganization,
  type GlobalDepartment,
} from '../services/super-admin.service';
import { EditAgentDrawer } from './edit-agent-drawer';

interface AgentsPanelProps {
  organizations: SuperAdminOrganization[];
  loading: boolean;
  onChanged: () => void;
}

export function AgentsPanel({ organizations, loading: orgsLoading, onChanged }: AgentsPanelProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterOrgId, setFilterOrgId] = useState<string>('');
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  const [filterModelId, setFilterModelId] = useState<string>('');
  const [editingAgent, setEditingAgent] = useState<SuperAdminAgent | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copyTargetOrgId, setCopyTargetOrgId] = useState('');
  const [bulkSourceOrgId, setBulkSourceOrgId] = useState('');

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['super-admin-agents', filterOrgId],
    queryFn: () => superAdminService.listAllAgents(filterOrgId || undefined),
  });

  // Load departments from API
  const { data: departments = [] } = useQuery({
    queryKey: ['super-admin-departments'],
    queryFn: () => superAdminService.listDepartments(),
  });

  const departmentOptions = useMemo(() => {
    return departments.map((d) => d.name).sort();
  }, [departments]);

  const modelOptions = useMemo(() => {
    const unique = new Set<string>();
    agents.forEach((a) => {
      if (a.modelId) unique.add(a.modelId);
    });
    return Array.from(unique).sort();
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const q = search.toLowerCase();
    return agents.filter((a) => {
      if (search.trim()) {
        if (
          !a.name.toLowerCase().includes(q) &&
          !a.modelId.toLowerCase().includes(q) &&
          !a.organization.name.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterDepartment && a.department !== filterDepartment) return false;
      if (filterModelId && a.modelId !== filterModelId) return false;
      return true;
    });
  }, [agents, search, filterDepartment, filterModelId]);

  const copyMutation = useMutation({
    mutationFn: ({ agentId, targetOrgId }: { agentId: string; targetOrgId: string }) =>
      superAdminService.copyAgent(agentId, targetOrgId),
    onSuccess: (result) => {
      toast.success(`Agente copiado com sucesso (incluindo setores vinculados)`);
      queryClient.invalidateQueries({ queryKey: ['super-admin-agents'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Erro ao copiar'),
  });

  const bulkCopyMutation = useMutation({
    mutationFn: ({ sourceOrgId, targetOrgId }: { sourceOrgId: string; targetOrgId: string }) =>
      superAdminService.copyAgentsBulk(sourceOrgId, targetOrgId),
    onSuccess: (result) => {
      toast.success(
        `${result.copied} agente(s) e ${result.sectorsCopied ?? 0} setor(es) copiado(s) com sucesso`,
      );
      queryClient.invalidateQueries({ queryKey: ['super-admin-agents'] });
      setBulkSourceOrgId('');
      setCopyTargetOrgId('');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Erro ao copiar em massa'),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAgents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAgents.map((a) => a.id)));
    }
  };

  const handleBulkCopy = () => {
    const targetOrgId = copyTargetOrgId;
    if (selectedIds.size === 0) {
      toast.error('Selecione ao menos um agente');
      return;
    }
    if (!targetOrgId) {
      toast.error('Selecione a empresa de destino');
      return;
    }
    // Copy each selected agent individually
    let completed = 0;
    const total = selectedIds.size;
    selectedIds.forEach((agentId) => {
      // Get the agent to check if it's already in the target org
      const agent = agents.find((a) => a.id === agentId);
      if (agent?.organizationId === targetOrgId) {
        completed++;
        if (completed === total) {
          toast.success(`Agentes copiados`);
          queryClient.invalidateQueries({ queryKey: ['super-admin-agents'] });
          setSelectedIds(new Set());
        }
        return;
      }
      copyMutation.mutate(
        { agentId, targetOrgId },
        {
          onSettled: () => {
            completed++;
            if (completed === total) {
              queryClient.invalidateQueries({ queryKey: ['super-admin-agents'] });
              setSelectedIds(new Set());
            }
          },
        },
      );
    });
  };

  const availableOrgs = organizations.filter((o) => o.status === 'ACTIVE');

  return (
    <section className="mt-6">
      <EditAgentDrawer
        agent={editingAgent}
        onClose={() => setEditingAgent(null)}
        onSaved={onChanged}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Agentes IA ({agents.length})
        </h2>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, modelo ou empresa..."
            className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
        </div>

        <div className="relative">
          <select
            value={filterOrgId}
            onChange={(e) => setFilterOrgId(e.target.value)}
            className="appearance-none rounded-md border border-zinc-300 bg-white px-4 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          >
            <option value="">Todas as empresas</option>
            {availableOrgs.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div className="relative">
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="appearance-none rounded-md border border-zinc-300 bg-white px-4 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          >
            <option value="">Todos departamentos</option>
            {departmentOptions.map((dep) => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div className="relative">
          <select
            value={filterModelId}
            onChange={(e) => setFilterModelId(e.target.value)}
            className="appearance-none rounded-md border border-zinc-300 bg-white px-4 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          >
            <option value="">Todos modelos</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>{m.split('/').pop()}</option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Bulk copy from org */}
        <div className="relative">
          <select
            value={bulkSourceOrgId}
            onChange={(e) => setBulkSourceOrgId(e.target.value)}
            className="appearance-none rounded-md border border-zinc-300 bg-white px-4 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          >
            <option value="">Copiar tudo de...</option>
            {availableOrgs.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {bulkSourceOrgId && (
          <>
            <span className="text-xs text-zinc-500">→</span>
            <div className="relative">
              <select
                value={copyTargetOrgId}
                onChange={(e) => setCopyTargetOrgId(e.target.value)}
                className="appearance-none rounded-md border border-zinc-300 bg-white px-4 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
              >
                <option value="">Para...</option>
                {availableOrgs.filter((o) => o.id !== bulkSourceOrgId).map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <button
              onClick={() => {
                if (!copyTargetOrgId) { toast.error('Selecione a empresa de destino'); return; }
                if (!confirm(`Copiar todos os agentes da empresa selecionada para a empresa de destino?`)) return;
                bulkCopyMutation.mutate({ sourceOrgId: bulkSourceOrgId, targetOrgId: copyTargetOrgId });
              }}
              disabled={!copyTargetOrgId || bulkCopyMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {bulkCopyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copiar em massa
            </button>
          </>
        )}
      </div>

      {/* Batch actions */}
      {selectedIds.size > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {selectedIds.size} selecionado(s)
          </span>
          <select
            value={copyTargetOrgId}
            onChange={(e) => setCopyTargetOrgId(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          >
            <option value="">Copiar para...</option>
            {availableOrgs.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <button
            onClick={handleBulkCopy}
            disabled={!copyTargetOrgId}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <CopyCheck className="h-3.5 w-3.5" />
            Copiar selecionados
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:bg-white/5">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredAgents.length && filteredAgents.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
                />
              </th>
              <th className="px-4 py-3">Agente</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Modelo</th>
              <th className="px-4 py-3">Departamento</th>
              <th className="px-4 py-3">Canais</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton cols={8} />
            ) : filteredAgents.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-500">
                  Nenhum agente encontrado
                </td>
              </tr>
            ) : (
              filteredAgents.map((agent) => (
                <tr key={agent.id} className="border-b border-zinc-50 dark:border-white/10">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(agent.id)}
                      onChange={() => toggleSelect(agent.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{agent.name}</p>
                        <p className="text-xs text-zinc-400">{agent.kind}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {agent.organization.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{agent.modelId.split('/').pop()}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{agent.department ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{agent.channels.length}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        agent.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                      }`}
                    >
                      <Sparkles className="h-3 w-3" />
                      {agent.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => setEditingAgent(agent)}
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                        title="Editar agente"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <div className="relative">
                        <select
                          value=""
                          onChange={(e) => {
                            const targetId = e.target.value;
                            if (targetId) {
                              copyMutation.mutate({ agentId: agent.id, targetOrgId: targetId });
                            }
                            e.target.value = '';
                          }}
                          className="appearance-none rounded-md border border-zinc-200 bg-white px-4 py-1.5 pr-10 text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/10 dark:bg-black dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100 cursor-pointer"
                          title="Copiar agente para outra empresa"
                        >
                          <option value="">Copiar para...</option>
                          {availableOrgs.filter((o) => o.id !== agent.organizationId).map((org) => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                          ))}
                        </select>
                        <svg
                          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, row) => (
        <tr key={row}>
          {Array.from({ length: cols }).map((__, col) => (
            <td key={col} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-zinc-100 dark:bg-black" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
