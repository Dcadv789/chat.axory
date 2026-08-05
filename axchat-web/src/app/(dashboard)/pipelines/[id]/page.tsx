'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { KanbanSquare, Settings } from 'lucide-react';
import { pipelinesService } from '@/features/pipelines/services/pipelines.service';
import { KanbanBoard } from '@/features/pipelines/components/kanban-board';
import { StagesDialog } from '@/features/pipelines/components/stages-dialog';
import { PageHeader } from '@/components/layout/page-header';

export default function PipelineBoardPage() {
  const params = useParams<{ id: string }>();
  const pipelineId = params?.id;
  const [stagesOpen, setStagesOpen] = useState(false);

  const { data: board } = useQuery({
    queryKey: ['pipeline-board', pipelineId],
    queryFn: () => pipelinesService.getBoard(pipelineId!),
    enabled: !!pipelineId,
  });

  if (!pipelineId) return null;

  return (
    <PageHeader
      icon={KanbanSquare}
      title={board?.pipeline?.name ?? 'Pipeline'}
      subtitle={board?.pipeline?.description || 'Quadro kanban do pipeline'}
      breadcrumb={[{ label: 'Pipelines', href: '/pipelines' }]}
      contentClassName="flex min-h-0 flex-1 flex-col px-4 pt-3"
      actions={
        <button
          onClick={() => setStagesOpen(true)}
          disabled={!board}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <Settings className="h-3.5 w-3.5" />
          Configurar stages
        </button>
      }
    >
      {/* Board ocupa o resto da altura; -mx-4 pra ir de ponta a ponta (kanban rola na horizontal) */}
      <div className="-mx-4 min-h-0 flex-1 overflow-hidden">
        <KanbanBoard pipelineId={pipelineId} />
      </div>

      {board && (
        <StagesDialog
          open={stagesOpen}
          pipelineId={pipelineId}
          initialStages={board.stages}
          onClose={() => setStagesOpen(false)}
          onSaved={() => setStagesOpen(false)}
        />
      )}
    </PageHeader>
  );
}
