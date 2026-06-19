'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Building2, Search, Copy, CopyCheck, Loader2, X, Code2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  type SuperAdminSkill,
  type SuperAdminOrganization,
} from '../services/super-admin.service';

interface SkillsPanelProps {
  organizations: SuperAdminOrganization[];
  loading: boolean;
  onChanged: () => void;
}

export function SkillsPanel({ organizations, loading: orgsLoading, onChanged }: SkillsPanelProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterOrgId, setFilterOrgId] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['super-admin-skills', filterOrgId],
    queryFn: () => superAdminService.listAllSkills(filterOrgId || undefined),
  });

  const availableOrgs = organizations.filter((o) => o.status === 'ACTIVE');

  const filteredSkills = skills.filter((s) => {
    const q = search.toLowerCase();
    if (search.trim()) {
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.organization.name.toLowerCase().includes(q) &&
        !s.description.toLowerCase().includes(q)
      ) return false;
    }
    if (filterSource && s.source !== filterSource) return false;
    return true;
  });

  const copyMutation = useMutation({
    mutationFn: ({ skillId, targetOrgId }: { skillId: string; targetOrgId: string }) =>
      superAdminService.copySkill(skillId, targetOrgId),
    onSuccess: () => {
      toast.success('Skill copiada com sucesso (credenciais NÃO foram copiadas)');
      queryClient.invalidateQueries({ queryKey: ['super-admin-skills'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Erro ao copiar skill'),
  });

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Skills ({skills.length})
        </h2>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa ou descrição..."
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
          <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div className="relative">
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="appearance-none rounded-md border border-zinc-300 bg-white px-4 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          >
            <option value="">Todas sources</option>
            <option value="HTTP">HTTP</option>
            <option value="SQL">SQL</option>
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:bg-white/5">
            <tr>
              <th className="px-4 py-3">Skill</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Tool</th>
              <th className="px-4 py-3">Uso</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton cols={7} />
            ) : filteredSkills.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">
                  Nenhuma skill encontrada
                </td>
              </tr>
            ) : (
              filteredSkills.map((skill) => (
                <tr key={skill.id} className="border-b border-zinc-50 dark:border-white/10">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        <Code2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{skill.name}</p>
                        <p className="max-w-64 truncate text-xs text-zinc-400">{skill.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {skill.organization.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      skill.source === 'HTTP'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                    }`}>
                      {skill.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {skill.tool ? skill.tool.name : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {skill._count.agents} agente(s)
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      skill.isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                    }`}>
                      <Bot className="h-3 w-3" />
                      {skill.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block">
                      <select
                        value=""
                        onChange={(e) => {
                          const targetId = e.target.value;
                          if (targetId) {
                            copyMutation.mutate({ skillId: skill.id, targetOrgId: targetId });
                          }
                          e.target.value = '';
                        }}
                        className="appearance-none rounded-md border border-zinc-200 bg-white px-4 py-1.5 pr-10 text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/10 dark:bg-black dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100 cursor-pointer"
                        title="Copiar skill para outra empresa"
                      >
                        <option value="">Copiar para...</option>
                        {availableOrgs.filter((o) => o.id !== skill.organizationId).map((org) => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
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
