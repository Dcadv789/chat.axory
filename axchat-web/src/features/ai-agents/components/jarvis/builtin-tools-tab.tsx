'use client';

import { useQuery } from '@tanstack/react-query';
import { Code2, Bot } from 'lucide-react';
import { superAdminService } from '@/features/super-admin/services/super-admin.service';

export function JarvisBuiltinToolsTab() {
  const { data: tools, isLoading } = useQuery({
    queryKey: ['super-admin-builtin-tools'],
    queryFn: () => superAdminService.listBuiltinTools(),
  });

  if (isLoading) {
    return (
      <div className="h-40 animate-pulse rounded-xl bg-zinc-100 p-6 dark:bg-black" />
    );
  }

  if (!tools || tools.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 p-10 text-center dark:border-white/10">
        <Code2 className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
        <p className="mt-3 text-sm font-medium text-zinc-600">
          Nenhuma tool built-in registrada
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="rounded-lg border border-violet-200/60 bg-violet-50/60 p-4 text-xs text-violet-700 dark:border-violet-800/30 dark:bg-violet-950/20 dark:text-violet-300">
        <p className="font-medium">Tools nativas do sistema</p>
        <p className="mt-1">
          Essas tools são registradas automaticamente pelo backend e estão
          sempre disponíveis para os agentes de IA. Não é possível editá-las
          ou excluí-las &mdash; são parte do núcleo do sistema.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {tools.map((tool) => {
          const kindLabels = (tool.kinds ?? [])
            .map((k: string) =>
              k === 'ORCHESTRATOR' ? 'Orquestrador' : 'Worker',
            )
            .join(', ');
          return (
            <div
              key={tool.name}
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
                      {tool.clientOps && (
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                          restrito
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
