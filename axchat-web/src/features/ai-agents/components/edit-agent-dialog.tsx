'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, X, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  aiAgentsService,
  CURATED_MODELS,
  DEPARTMENTS,
  type AiAgent,
  type AgentMode,
  type AgentSector,
} from '../services/ai-agents.service';
import { aiCatalogService } from '../services/ai-catalog.service';
import { channelsService } from '@/features/channels/services/channels.service';
import { aiModelProvidersService } from '@/features/settings/services/ai-model-providers.service';
import { agentSectorsService } from '@/features/ai-agents/services/agent-sectors.service';
import { useOrgId } from '@/hooks/use-org-query-key';

interface EditAgentDialogProps {
  agent: AiAgent | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditAgentDialog({
  agent,
  onClose,
  onSaved,
}: EditAgentDialogProps) {
  const orgId = useOrgId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modelId, setModelId] = useState('anthropic/claude-sonnet-4-6');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [parentAgentId, setParentAgentId] = useState<string>('');
  const [sector, setSector] = useState<AgentSector>('ATENDIMENTO');
  const [department, setDepartment] = useState<string>('');
  const [squad, setSquad] = useState('');
  const [operationalContext, setOperationalContext] = useState('');
  const [operationalContextUpdatedAt, setOperationalContextUpdatedAt] = useState<
    string | null
  >(null);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelMode, setNewChannelMode] = useState<AgentMode>('AUTONOMOUS');

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelsService.list(),
    enabled: !!agent,
  });

  // Other agents in the org for the "reports to" dropdown.
  const { data: allAgents } = useQuery({
    queryKey: ['ai-agents', orgId],
    queryFn: () => aiAgentsService.list(),
    enabled: !!agent,
  });

  // Load registered AI models for this organization
  const { data: orgModels = [] } = useQuery({
    queryKey: ['ai-model-providers'],
    queryFn: () => aiModelProvidersService.list(),
    enabled: !!agent,
  });

  // Load sectors
  const { data: sectors = [] } = useQuery({
    queryKey: ['agent-sectors'],
    queryFn: () => agentSectorsService.list(),
    enabled: !!agent,
  });

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setDescription(agent.description ?? '');
    setModelId(agent.modelId);
    setSystemPrompt(agent.systemPrompt);
    setTemperature(agent.temperature);
    setParentAgentId(agent.parentAgentId ?? '');
    setSector(agent.sector ?? 'ATENDIMENTO');
    setDepartment(agent.department ?? '');
    setSquad(agent.squad ?? '');
    setOperationalContext(agent.operationalContext ?? '');
    setOperationalContextUpdatedAt(agent.operationalContextUpdatedAt ?? null);
    // Determine which sectors this agent belongs to
    const sectorIds = sectors
      .filter((s) => s.agents.some((link) => link.agent.id === agent.id))
      .map((s) => s.id);
    setSectorIds(sectorIds);
  }, [agent, sectors]);

  if (!agent) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await aiAgentsService.update(agent.id, {
        name,
        description,
        modelId,
        systemPrompt,
        temperature,
        sector,
        parentAgentId: parentAgentId || null,
        department: department || null,
        squad: squad.trim() || null,
        operationalContext: operationalContext.trim() || null,
      });
      // Sync sector associations
      const currentSectorIds = sectors
        .filter((s) => s.agents.some((link) => link.agent.id === agent.id))
        .map((s) => s.id);
      // Remove from sectors that were deselected
      for (const sid of currentSectorIds) {
        if (!sectorIds.includes(sid)) {
          try { await agentSectorsService.removeAgent(sid, agent.id); } catch {}
        }
      }
      // Add to new sectors
      for (const sid of sectorIds) {
        if (!currentSectorIds.includes(sid)) {
          try { await agentSectorsService.addAgent(sid, agent.id); } catch {}
        }
      }
      toast.success('Agente atualizado');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Excluir "${agent.name}"? Essa ação é irreversível.`))
      return;
    try {
      await aiAgentsService.remove(agent.id);
      toast.success('Agente excluído');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao excluir');
    }
  };

  const handleAddChannel = async () => {
    if (!newChannelId) return;
    try {
      await aiAgentsService.assignChannel(agent.id, {
        channelId: newChannelId,
        mode: newChannelMode,
      });
      toast.success('Canal vinculado');
      setShowAddChannel(false);
      setNewChannelId('');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao vincular canal');
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    try {
      await aiAgentsService.unassignChannel(agent.id, channelId);
      toast.success('Canal removido do agente');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao desvincular');
    }
  };

  const availableChannels = (channels ?? []).filter(
    (c) => !agent.channels?.some((ac) => ac.channelId === c.id),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-black">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/10">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Editar agente
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Modelo
            </label>
            {orgModels.length > 0 ? (
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
              >
                {orgModels.filter((m) => m.isActive).map((m) => (
                  <option key={m.id} value={m.modelId}>
                    {m.name} ({m.provider}) — {m.modelId}
                  </option>
                ))}
                {!orgModels.some((m) => m.modelId === modelId) && (
                  <option value={modelId}>{modelId} (custom — não listado)</option>
                )}
              </select>
            ) : (
              <div>
                <input
                  type="text"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="Ex: anthropic/claude-sonnet-4-6"
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Nenhum modelo cadastrado. Vá em Configurações &gt; IA &gt; Modelos para registrar.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              System prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
          </div>

          <div className="rounded-lg border-2 border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                  Contexto operacional do dia
                </p>
                <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-200/70">
                  Memória viva injetada no prompt — atualize quando rodar
                  campanha, der aula, mudar oferta. Ex: &quot;Hoje 20h teve aula
                  de Skills. Pra quem responder feedback positivo, ofereça
                  Dominando Claude Code R$ 1.497 (link X).&quot;
                </p>
              </div>
              {operationalContextUpdatedAt && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Atualizado{' '}
                  {formatRelative(operationalContextUpdatedAt)}
                </span>
              )}
            </div>
            <textarea
              value={operationalContext}
              onChange={(e) => setOperationalContext(e.target.value)}
              rows={4}
              placeholder="Deixe vazio se hoje não tem nada operacional..."
              maxLength={8000}
              className="mt-3 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-xs dark:border-amber-900/60 dark:bg-black dark:text-zinc-100"
            />
            <p className="mt-1 text-right text-[10px] text-amber-700/60 dark:text-amber-300/60">
              {operationalContext.length}/8000
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Criatividade ({temperature.toFixed(2)})
            </label>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="mt-2 w-full"
            />
          </div>

          {/* Organograma matricial ágil */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Organograma
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Define hierarquia (chefia direta), departamento e squad ágil.
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Reporta a (chefe direto)
                </label>
                <select
                  value={parentAgentId}
                  onChange={(e) => setParentAgentId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                >
                  <option value="">— Raiz / sem chefe (CEO virtual) —</option>
                  {(allAgents ?? [])
                    .filter((a) => a.id !== agent.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{' '}
                        {a.kind === 'ORCHESTRATOR' ? '(Orquestrador)' : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Setor
                </label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value as AgentSector)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                >
                  <option value="ATENDIMENTO">Atendimento</option>
                  <option value="MARKETING">Marketing</option>
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Departamento
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                  >
                    <option value="">— Não definido —</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Squad ágil
                  </label>
                  <input
                    type="text"
                    value={squad}
                    onChange={(e) => setSquad(e.target.value)}
                    placeholder="Ex: Inbound B2C"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Setores de Operação */}
          {sectors.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Setores de Operação
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Selecione os setores aos quais este agente pertence.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sectors.map((s) => {
                  const selected = sectorIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSectorIds((prev) =>
                          selected
                            ? prev.filter((id) => id !== s.id)
                            : [...prev, s.id],
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? 'text-white'
                          : 'border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-white/15 dark:bg-black dark:text-zinc-400'
                      }`}
                      style={
                        selected
                          ? { backgroundColor: s.color ?? '#8b5cf6' }
                          : undefined
                      }
                    >
                      {s.name}
                      {selected && (
                        <span className="ml-0.5">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {agent && (
            <AgentSkillsAndTools agentId={agent.id} />
          )}

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Canais
              </h4>
              {!showAddChannel && availableChannels.length > 0 && (
                <button
                  onClick={() => setShowAddChannel(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:bg-black dark:text-zinc-300"
                >
                  <Plus className="h-3 w-3" /> Vincular canal
                </button>
              )}
            </div>
            {showAddChannel && (
              <div className="mt-3 flex items-center gap-2">
                <select
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black dark:text-zinc-100"
                >
                  <option value="">Selecione um canal…</option>
                  {availableChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
                <select
                  value={newChannelMode}
                  onChange={(e) => setNewChannelMode(e.target.value as AgentMode)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black dark:text-zinc-100"
                >
                  <option value="AUTONOMOUS">Autônomo</option>
                  <option value="COPILOT">Copiloto</option>
                  <option value="DISABLED">Desativado</option>
                </select>
                <button
                  onClick={handleAddChannel}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowAddChannel(false)}
                  className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {(agent.channels ?? []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-black"
                >
                  <div className="text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {c.channel.name}
                    </span>
                    <span className="ml-2 text-[11px] text-zinc-500">
                      {c.channel.type} · {c.mode.toLowerCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveChannel(c.channelId)}
                    className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {(agent.channels ?? []).length === 0 && (
                <p className="text-xs text-zinc-500">
                  Nenhum canal vinculado. O agente não vai responder ninguém ainda.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-white/10 dark:bg-black">
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              Fechar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const ageMs = Date.now() - d.getTime();
  const ageHours = Math.floor(ageMs / 3_600_000);
  if (ageHours < 1) return 'há minutos';
  if (ageHours < 24) return `há ${ageHours}h`;
  const ageDays = Math.floor(ageHours / 24);
  if (ageDays < 30) return `há ${ageDays}d`;
  return `há ${Math.floor(ageDays / 30)} meses`;
}

function AgentSkillsAndTools({ agentId }: { agentId: string }) {
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);
  const queryClient = useQueryClient();

  const { data: skills } = useQuery({
    queryKey: ['ai-skills'],
    queryFn: () => aiCatalogService.listSkills(),
  });

  // Bindings (agent, skill) carregam o estado de `requiresApproval` por
  // skill já atribuída. Refetch agressivo porque mudança aqui é raríssima
  // mas crítica (define se executa direto ou cria PendingAction).
  const { data: bindings } = useQuery({
    queryKey: ['ai-agent-skills', agentId],
    queryFn: () => aiAgentsService.listAgentSkills(agentId),
    enabled: !!agentId,
  });

  const approvalByskillId = new Map(
    (bindings ?? []).map((b) => [b.skillId, b.requiresApproval]),
  );

  useEffect(() => {
    if (!skills) return;
    const ids = skills
      .filter((s) => (s.agents ?? []).some((a) => a.agent.id === agentId))
      .map((s) => s.id);
    setSkillIds(ids);
  }, [skills, agentId]);

  const toggleSkill = (id: string) =>
    setSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleSaveSkills = async () => {
    setSavingSkills(true);
    try {
      await aiCatalogService.setAgentSkills(agentId, skillIds);
      // Recarrega bindings — skills atribuídas mudaram, requiresApproval
      // de skills novas é false por padrão.
      await queryClient.invalidateQueries({
        queryKey: ['ai-agent-skills', agentId],
      });
      toast.success('Skills atualizadas');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro');
    } finally {
      setSavingSkills(false);
    }
  };

  const toggleApproval = async (skillId: string, next: boolean) => {
    try {
      await aiAgentsService.setSkillApproval(agentId, skillId, next);
      await queryClient.invalidateQueries({
        queryKey: ['ai-agent-skills', agentId],
      });
      toast.success(
        next
          ? 'Skill agora exige aprovação humana antes de executar'
          : 'Skill volta a executar automaticamente',
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Skills atribuídas ({skillIds.length})
          </h4>
          <button
            onClick={handleSaveSkills}
            disabled={savingSkills}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {savingSkills ? '…' : 'Salvar skills'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Cada skill é uma função invocável (ex: /resetPassword) ligada à sua
          tool (provider). Built-in essenciais (reply/transfer/tag) são
          incluídas automaticamente.
        </p>
        <p className="mt-2 text-[10px] text-zinc-400">
          💡 Skills marcadas com <ShieldCheck className="inline h-3 w-3 text-amber-600" />{' '}
          exigem aprovação humana via inbox antes de executar — útil pra ações
          irreversíveis (liberar acesso, resetar senha). Padrão: executa direto.
        </p>
        <div className="mt-2 max-h-72 overflow-y-auto">
          {(skills ?? []).map((s) => {
            const checked = skillIds.includes(s.id);
            const requiresApproval = approvalByskillId.get(s.id) ?? false;
            return (
              <div
                key={s.id}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white dark:hover:bg-white/10 ${
                  checked ? 'bg-white dark:bg-black' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSkill(s.id)}
                  className="mt-0.5 h-3.5 w-3.5 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {s.name}
                    </span>
                    {s.category && (
                      <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] uppercase text-zinc-600 dark:bg-zinc-700">
                        {s.category}
                      </span>
                    )}
                    <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] uppercase text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                      {s.source}
                    </span>
                    {checked && (
                      <button
                        type="button"
                        onClick={() => toggleApproval(s.id, !requiresApproval)}
                        className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          requiresApproval
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-black dark:text-zinc-400'
                        }`}
                        title={
                          requiresApproval
                            ? 'Clique pra desligar — skill volta a executar automaticamente'
                            : 'Clique pra ligar — skill vai exigir aprovação humana antes de executar'
                        }
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {requiresApproval ? 'Aprovação' : 'Auto'}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500 line-clamp-1">
                    {s.description}
                    {s.tool && (
                      <>
                        {' · via '}
                        <code className="font-mono">{s.tool.name}</code>
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          {(skills ?? []).length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-zinc-400">
              Nenhuma skill cadastrada. Crie em Jarvis &gt; Skills.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
