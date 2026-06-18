'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, X, Plus, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  type SuperAdminAgent,
} from '../services/super-admin.service';
import {
  aiAgentsService,
  DEPARTMENTS,
  type AgentMode,
} from '@/features/ai-agents/services/ai-agents.service';
import { aiCatalogService } from '@/features/ai-agents/services/ai-catalog.service';
import { channelsService } from '@/features/channels/services/channels.service';
import {
  aiModelProvidersService,
  type AiModelProvider,
} from '@/features/settings/services/ai-model-providers.service';
import { agentSectorsService } from '@/features/ai-agents/services/agent-sectors.service';

interface EditAgentDrawerProps {
  agent: SuperAdminAgent | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500';

const selectCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100';

export function EditAgentDrawer({ agent, onClose, onSaved }: EditAgentDrawerProps) {
  const queryClient = useQueryClient();

  // Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modelId, setModelId] = useState('anthropic/claude-sonnet-4-6');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [parentAgentId, setParentAgentId] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [squad, setSquad] = useState('');
  const [category, setCategory] = useState('');
  const [operationalContext, setOperationalContext] = useState('');
  const [operationalContextUpdatedAt, setOperationalContextUpdatedAt] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelMode, setNewChannelMode] = useState<AgentMode>('AUTONOMOUS');

  // Load channels for linking
  const { data: allChannels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelsService.list(),
    enabled: !!agent,
  });

  // Load all agents in the same org for the parent dropdown
  const { data: allOrgAgents } = useQuery({
    queryKey: ['super-admin-agents-org', agent?.organizationId],
    queryFn: () => superAdminService.listAllAgents(agent?.organizationId),
    enabled: !!agent,
  });

  // Load registered models for the agent's organization
  const { data: orgModels = [] } = useQuery({
    queryKey: ['super-admin-org-models', agent?.organizationId],
    queryFn: () => superAdminService.listOrgModels(agent!.organizationId),
    enabled: !!agent,
  });

  // Load sectors for the agent's organization
  const { data: sectors = [] } = useQuery({
    queryKey: ['super-admin-org-sectors', agent?.organizationId],
    queryFn: () => superAdminService.listOrgSectors(agent!.organizationId),
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
    setDepartment(agent.department ?? '');
    setSquad(agent.squad ?? '');
    setCategory(agent.category ?? '');
    setOperationalContext(agent.operationalContext ?? '');
    setOperationalContextUpdatedAt(agent.operationalContextUpdatedAt ?? null);
    setIsActive(agent.isActive);
    setShowAddChannel(false);
    setNewChannelId('');
    setNewChannelMode('AUTONOMOUS');
    // Determine which sectors this agent belongs to
    const memberSectorIds = sectors
      .filter((s: any) => s.agents?.some((link: any) => link.agent.id === agent.id))
      .map((s: any) => s.id);
    setSectorIds(memberSectorIds);
  }, [agent, sectors]);

  if (!agent) return null;

  const availableChannels = (allChannels ?? []).filter(
    (c) => !agent.channels?.some((ac) => ac.channel.id === c.id),
  );

  const otherAgents = (allOrgAgents ?? []).filter((a) => a.id !== agent.id);

  // ── Save ────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      await superAdminService.updateAgent(agent.id, {
        name: name.trim(),
        description: description.trim() || null,
        modelId,
        systemPrompt: systemPrompt.trim(),
        temperature,
        parentAgentId: parentAgentId || null,
        department: department || null,
        squad: squad.trim() || null,
        category: category.trim() || null,
        operationalContext: operationalContext.trim() || null,
        isActive,
      });
      // Sync sector associations
      const currentSectorIds = sectors
        .filter((s: any) => s.agents?.some((link: any) => link.agent.id === agent.id))
        .map((s: any) => s.id);
      for (const sid of currentSectorIds) {
        if (!sectorIds.includes(sid)) {
          try { await superAdminService.removeAgentFromSector(sid, agent.id); } catch {}
        }
      }
      for (const sid of sectorIds) {
        if (!currentSectorIds.includes(sid)) {
          try { await superAdminService.addAgentToSector(sid, agent.id); } catch {}
        }
      }
      toast.success('Agente atualizado');
      queryClient.invalidateQueries({ queryKey: ['super-admin-agents'] });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  // ── Delete ──────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm(`Excluir "${agent.name}" permanentemente? Essa ação é irreversível.`)) return;
    try {
      await aiAgentsService.remove(agent.id);
      toast.success('Agente excluído');
      queryClient.invalidateQueries({ queryKey: ['super-admin-agents'] });
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao excluir');
    }
  };

  // ── Channel management ──────────────────────────────
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
      queryClient.invalidateQueries({ queryKey: ['super-admin-agents'] });
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao vincular canal');
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    try {
      await aiAgentsService.unassignChannel(agent.id, channelId);
      toast.success('Canal removido');
      queryClient.invalidateQueries({ queryKey: ['super-admin-agents'] });
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao desvincular');
    }
  };

  // ── Skills ──────────────────────────────────────────
  // Skills are loaded and managed inline via AgentSkillsSection

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        {/* ─── Header ─── */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Editar agente
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              {agent.organization.name} · {agent.kind}
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
        <div className="flex-1 space-y-5 overflow-y-auto bg-[#f8fafc] px-6 py-5 dark:bg-[#171717]">
          {/* ── Card: Dados básicos ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dados básicos</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Nome" value={name} onChange={setName} />
              <Field label="Descrição" value={description} onChange={setDescription} />
              <Field label="Categoria" value={category} onChange={setCategory} placeholder="vendas / suporte" />
              <Field label="Squad ágil" value={squad} onChange={setSquad} placeholder="Inbound B2C" />
            </div>

            <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-100 pt-4 dark:border-white/10">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
                />
                Agente ativo
              </label>
            </div>
          </div>

          {/* ── Card: Organograma ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Organograma</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Define hierarquia (chefia direta), departamento e squad ágil.
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Reporta a (chefe direto)
                </label>
                <select
                  value={parentAgentId}
                  onChange={(e) => setParentAgentId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">— Raiz / sem chefe (CEO virtual) —</option>
                  {otherAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.kind === 'ORCHESTRATOR' ? '(Orquestrador)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Departamento
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">— Não definido —</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Squad ágil
                  </label>
                  <input
                    type="text"
                    value={squad}
                    onChange={(e) => setSquad(e.target.value)}
                    placeholder="Ex: Inbound B2C"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Card: Setores de Operação ── */}
          {sectors.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Setores de Operação</h3>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Selecione os setores aos quais este agente pertence.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sectors.map((s: any) => {
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
                      {selected && <span className="ml-0.5">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Card: Modelo e comportamento ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Modelo</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Modelo
                </label>
                {orgModels.length > 0 ? (
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className={selectCls}
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
                      className={inputCls}
                    />
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Nenhum modelo cadastrado. Use Configurações &gt; IA &gt; Modelos para registrar.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Criatividade ({temperature.toFixed(2)})
                </label>
                <input
                  type="range" min="0" max="1.5" step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="mt-0.5 flex justify-between text-[10px] text-zinc-400">
                  <span>Determinístico</span>
                  <span>Criativo</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Card: Contexto operacional ── */}
          <div className="rounded-lg border-2 border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                  Contexto operacional do dia
                </p>
                <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-200/70">
                  Memória viva injetada no prompt — atualize quando rodar
                  campanha, der aula, mudar oferta.
                </p>
              </div>
              {operationalContextUpdatedAt && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Atualizado {formatRelative(operationalContextUpdatedAt)}
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

          {/* ── Card: System prompt ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">System prompt</h3>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className={`${inputCls} mt-2 font-mono text-xs`}
            />
          </div>

          {/* ── Card: Skills ── */}
          <AgentSkillsSection agentId={agent.id} />

          {/* ── Card: Canais ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Canais vinculados</h3>
                <p className="text-[11px] text-zinc-500">
                  Canais onde este agente pode atuar
                </p>
              </div>
              {!showAddChannel && availableChannels.length > 0 && (
                <button
                  onClick={() => setShowAddChannel(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-300"
                >
                  <Plus className="h-3.5 w-3.5" /> Vincular canal
                </button>
              )}
            </div>

            {showAddChannel && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-white/15 dark:bg-[#171717]">
                <label className="min-w-[180px] flex-1">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Canal</span>
                  <select
                    value={newChannelId}
                    onChange={(e) => setNewChannelId(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Selecione um canal…</option>
                    {availableChannels.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                    ))}
                  </select>
                </label>
                <label className="w-32">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Modo</span>
                  <select
                    value={newChannelMode}
                    onChange={(e) => setNewChannelMode(e.target.value as AgentMode)}
                    className={selectCls}
                  >
                    <option value="AUTONOMOUS">Autônomo</option>
                    <option value="COPILOT">Copiloto</option>
                    <option value="DISABLED">Desativado</option>
                  </select>
                </label>
                <button
                  onClick={handleAddChannel}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> OK
                </button>
                <button
                  onClick={() => setShowAddChannel(false)}
                  className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {(agent.channels ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-500 dark:border-white/15 dark:bg-white/5">
                  Nenhum canal vinculado. O agente não vai responder ninguém ainda.
                </p>
              ) : (
                (agent.channels ?? []).map((c) => (
                  <div
                    key={c.channel.id}
                    className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-black"
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.channel.name}</span>
                      <span className="ml-2 text-[11px] text-zinc-500">
                        {c.channel.type} · {c.mode.toLowerCase()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveChannel(c.channel.id)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      title="Desvincular canal"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Field component ────────────────────────────────
function Field({
  label, value, onChange, type = 'text', placeholder, className = '',
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

// ── Skills section ─────────────────────────────────
function AgentSkillsSection({ agentId }: { agentId: string }) {
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);
  const queryClient = useQueryClient();

  const { data: skills } = useQuery({
    queryKey: ['ai-skills'],
    queryFn: () => aiCatalogService.listSkills(),
  });

  const { data: bindings } = useQuery({
    queryKey: ['ai-agent-skills', agentId],
    queryFn: () => aiAgentsService.listAgentSkills(agentId),
    enabled: !!agentId,
  });

  const approvalBySkillId = useMemo(
    () => new Map((bindings ?? []).map((b) => [b.skillId, b.requiresApproval])),
    [bindings],
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
      await queryClient.invalidateQueries({ queryKey: ['ai-agent-skills', agentId] });
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
      await queryClient.invalidateQueries({ queryKey: ['ai-agent-skills', agentId] });
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
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Skills atribuídas ({skillIds.length})
          </h3>
          <p className="text-[11px] text-zinc-500">
            Cada skill é uma função invocável (ex: /resetPassword).
          </p>
        </div>
        <button
          onClick={handleSaveSkills}
          disabled={savingSkills}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {savingSkills ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {savingSkills ? '…' : 'Salvar skills'}
        </button>
      </div>

      <p className="mt-1 text-[10px] text-zinc-400">
        💡 Skills marcadas com <ShieldCheck className="inline h-3 w-3 text-amber-600" />{' '}
        exigem aprovação humana antes de executar. Padrão: executa direto.
      </p>

      <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-zinc-100 dark:border-white/10">
        {(skills ?? []).length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-zinc-400">
            Nenhuma skill cadastrada.
          </p>
        ) : (
          (skills ?? []).map((s) => {
            const checked = skillIds.includes(s.id);
            const requiresApproval = approvalBySkillId.get(s.id) ?? false;
            return (
              <div
                key={s.id}
                className={`flex items-start gap-2 border-b border-zinc-50 px-3 py-2 text-xs hover:bg-zinc-50 last:border-b-0 dark:border-white/5 dark:hover:bg-white/5 ${
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
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}</span>
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
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {requiresApproval ? 'Aprovação' : 'Auto'}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500 line-clamp-1">{s.description}</p>
                </div>
              </div>
            );
          })
        )}
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
