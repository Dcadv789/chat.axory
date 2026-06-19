'use client';

import { useQuery } from '@tanstack/react-query';
import { X, Clock, ArrowLeft } from 'lucide-react';
import { aiCatalogService, type AiSkill } from '../../services/ai-catalog.service';

interface Props {
  skill: AiSkill | null;
  onClose: () => void;
}

export function SkillVersionsDrawer({ skill, onClose }: Props) {
  const { data: versions, isLoading } = useQuery({
    queryKey: ['skill-versions', skill?.id],
    queryFn: () => aiCatalogService.listSkillVersions(skill!.id),
    enabled: !!skill,
  });

  if (!skill) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        {/* ─── Header ─── */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Versões: {skill.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              Histórico de alterações da skill
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ─── Scrollable body ─── */}
        <div className="flex-1 overflow-y-auto bg-[#f8fafc] dark:bg-[#171717]">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
                />
              ))}
            </div>
          ) : !versions || versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
              <Clock className="mb-2 h-8 w-8" />
              <p className="text-sm">Nenhuma versão anterior</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-white/5">
              {versions.map((v: any, idx: number) => (
                <div
                  key={v.id}
                  className="px-6 py-4 hover:bg-white dark:hover:bg-black/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                        {v.version}
                      </span>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {idx === 0 ? 'Versão atual' : `Versão ${v.version}`}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-400">
                      {new Date(v.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {v.changeNote && (
                    <p className="mt-1.5 text-xs text-zinc-500 pl-8">
                      {v.changeNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="flex shrink-0 items-center justify-start border-t border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </div>
      </div>
    </>
  );
}
