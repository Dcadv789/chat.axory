'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Wrench,
  Trash2,
  Edit2,
  Globe,
  Database,
  Sparkles,
  Code2,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  aiCatalogService,
  type AiTool,
} from '../../services/ai-catalog.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { ToolDialog } from './tool-dialog';

export function JarvisToolsTab() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AiTool | null>(null);

  const { data: tools, isLoading } = useQuery({
    queryKey: ['ai-tools', orgId],
    queryFn: () => aiCatalogService.listTools(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['ai-tools'] });

  const handleDelete = async (tool: AiTool) => {
    if (!confirm(`Excluir tool "${tool.name}"? Todas as skills que usam vão ficar sem tool.`)) return;
    try {
      await aiCatalogService.removeTool(tool.id);
      toast.success('Tool excluída');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao excluir');
    }
  };

  const builtins = (tools ?? []).filter((t) => t.source === 'BUILTIN');
  const customs = (tools ?? []).filter((t) => t.source !== 'BUILTIN');

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Tools nativas do sistema (sempre disponíveis) + suas tools custom.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nova tool
        </button>
      </div>

      {isLoading && (
        <div className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-black" />
      )}

      {/* ─── Built-in tools ────────────────── */}
      {builtins.length > 0 && (
        <>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <Code2 className="h-4 w-4 text-violet-500" />
            Nativas do sistema ({builtins.length})
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {builtins.map((tool) => {
              const kindLabels = (tool.builtinKinds ?? [])
                .map((k: string) => (k === 'ORCHESTRATOR' ? 'Orquestrador' : 'Worker'))
                .join(', ');
              return (
                <div
                  key={tool.id}
                  className="rounded-xl border border-violet-200/40 bg-violet-50/40 p-4 dark:border-violet-900/20 dark:bg-violet-950/10"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-violet-500" />
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {tool.name}
                        </p>
                        <span className="rounded-full bg-violet-200/60 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-800/30 dark:text-violet-400">
                          built-in
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600 line-clamp-2 dark:text-zinc-400">
                        {tool.description}
                      </p>
                      {kindLabels && (
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500">
                          <Bot className="h-3 w-3" />
                          Disponível para: {kindLabels}
                          {tool.builtinClientOps && (
                            <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                              restrito
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400">read-only</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Custom tools ────────────────── */}
      {customs.length > 0 && (
        <>
          <h4 className="flex items-center gap-2 pt-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <Wrench className="h-4 w-4 text-primary" />
            Tools custom ({customs.length})
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {customs.map((tool) => {
              const isHttp = tool.source === 'CUSTOM_HTTP';
              const Icon = isHttp ? Globe : Database;
              return (
                <div
                  key={tool.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {tool.name}
                        </p>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase ${
                            isHttp
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}
                        >
                          {isHttp ? 'HTTP' : 'SQL'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600 line-clamp-2 dark:text-zinc-400">
                        {tool.description}
                      </p>
                      {isHttp && tool.httpBaseUrl && (
                        <code className="mt-2 block truncate text-[11px] font-mono text-zinc-400">
                          {tool.httpBaseUrl}
                        </code>
                      )}
                      {!isHttp && tool.sqlConnectionRef && (
                        <code className="mt-2 block truncate text-[11px] font-mono text-zinc-400">
                          {`{{env.${tool.sqlConnectionRef}}}`}
                        </code>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setEditing(tool)}
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(tool)}
                        className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {tool._count && tool._count.skills > 0 && (
                    <div className="mt-3 flex items-center gap-1 text-[11px] text-zinc-500">
                      <Sparkles className="h-3 w-3" />
                      {tool._count.skills} skill{tool._count.skills > 1 ? 's' : ''} usando
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!isLoading && tools && tools.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 p-10 text-center dark:border-white/10">
          <Wrench className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-600">
            Nenhuma tool cadastrada
          </p>
          <p className="mt-1 max-w-md text-center text-xs text-zinc-400 mx-auto">
            Cadastre uma conexão HTTP (ex: Trivapp) ou SQL (ex: Hotwebinar) e
            depois crie skills que usam essa conexão.
          </p>
        </div>
      )}

      <ToolDialog
        open={showCreate}
        tool={null}
        onClose={() => setShowCreate(false)}
        onSaved={() => {
          refresh();
          setShowCreate(false);
        }}
      />
      <ToolDialog
        open={!!editing}
        tool={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          refresh();
          setEditing(null);
        }}
      />
    </div>
  );
}
