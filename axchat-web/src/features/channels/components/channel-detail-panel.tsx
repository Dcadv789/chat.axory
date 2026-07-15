'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy, Check, Loader2, Save, Trash2, Power, PowerOff,
  Globe, Lock, RefreshCw, AlertCircle, CheckCircle2, XCircle,
  Activity, Phone, Building2, Shield, Webhook,
  Radio, Eye, EyeOff, ExternalLink, Info, UserPlus, X, Users, Sparkles, Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import { channelsService, type Channel } from '../services/channels.service';
import { channelAccessService } from '../../settings/services/channel-access.service';
import { membersService } from '../../settings/services/members.service';
import { aiAgentsService } from '../../ai-agents/services/ai-agents.service';
import { useChannelSync } from '../hooks/use-channel-sync';
import { ZappfyIcon, MetaIcon, InstagramIcon, TelegramIcon } from '@/components/ui/icons';

const channelTypeMap: Record<string, { label: string; icon: React.ElementType }> = {
  WHATSAPP_ZAPPFY: { label: 'WhatsApp (Zappfy)', icon: ZappfyIcon },
  WHATSAPP_OFFICIAL: { label: 'WhatsApp Official', icon: MetaIcon },
  INSTAGRAM: { label: 'Instagram', icon: InstagramIcon },
  TELEGRAM: { label: 'Telegram', icon: TelegramIcon },
};

const inputCls =
  'flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100';
const labelCls = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

type InternalTab = 'dados' | 'agentes' | 'config' | 'saude';

interface ChannelDetailPanelProps {
  channel: Channel;
  onUpdate: () => void;
  onSelect: (ch: Channel) => void;
}

export function ChannelDetailPanel({ channel, onUpdate, onSelect }: ChannelDetailPanelProps) {
  const meta = channelTypeMap[channel.type] || { label: channel.type, icon: Radio };
  const Icon = meta.icon;
  const sync = useChannelSync({ channelId: channel.id, channelType: channel.type });

  const [tab, setTab] = useState<InternalTab>('dados');
  const [name, setName] = useState(channel.name);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [webhookSecret, setWebhookSecret] = useState(channel.webhookSecret ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setName(channel.name);
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(channel.config ?? {})) {
      flat[k] = v == null ? '' : String(v);
    }
    setConfig(flat);
    setWebhookSecret(channel.webhookSecret ?? '');
    setTab('dados');
  }, [channel]);

  const webhookUrl = `${apiBaseUrl}/webhooks/${channel.type}`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setField = (k: string, v: string) =>
    setConfig((prev) => ({ ...prev, [k]: v }));

  const fields = fieldsFor(channel.type);

  const handleSaveCredentials = async () => {
    if (!name.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      const merged = { ...channel.config, ...config };
      for (const f of fields) {
        if (f.optional && !merged[f.key]?.trim()) delete merged[f.key];
      }
      await channelsService.update(channel.id, {
        name: name.trim(),
        config: merged,
        webhookSecret: webhookSecret.trim() || undefined,
      });
      toast.success('Canal atualizado');
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar');
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await channelsService.testConnection(channel.id);
      if (result.success) {
        toast.success(`Conexão OK`);
      } else {
        toast.error(`Falha: ${result.error}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao testar conexão');
    } finally { setIsTesting(false); }
  };

  const handleToggle = async () => {
    try {
      await channelsService.update(channel.id, { isActive: !channel.isActive });
      toast.success(channel.isActive ? 'Canal desativado' : 'Canal ativado');
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  };

  const handleToggleVisibility = async () => {
    const goingPrivate = channel.visibility !== 'PRIVATE';
    if (goingPrivate) {
      const ok = window.confirm(
        'Tornar este canal privado?\n\n' +
        'Apenas você e quem você der permissão explícita verão esse canal.'
      );
      if (!ok) return;
    }
    try {
      await channelsService.update(channel.id, {
        visibility: goingPrivate ? 'PRIVATE' : 'ORG',
      });
      toast.success(goingPrivate ? 'Canal privado' : 'Canal público');
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar visibilidade');
    }
  };

  const handleDelete = async () => {
    const typed = prompt(
      `Para remover o canal, digite o nome exato:\n\n"${channel.name}"`,
    );
    if (typed == null || typed.trim() !== channel.name) {
      if (typed != null) toast.error('Nome não confere — cancelado.');
      return;
    }
    try {
      await channelsService.remove(channel.id, typed.trim());
      toast.success('Canal removido');
      onSelect(null as any);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover');
    }
  };

  const isSyncRunning = sync.job?.status === 'RUNNING' || sync.job?.status === 'PENDING';
  const isSyncCompleted = sync.job?.status === 'COMPLETED';
  const isSyncFailed = sync.job?.status === 'FAILED';
  const progressPct =
    sync.job && sync.job.conversationsTotal > 0
      ? Math.min(100, Math.round((sync.job.conversationsImported / sync.job.conversationsTotal) * 100))
      : 0;


  const internalTabs = useMemo(() => {
    const items: { key: InternalTab; label: string }[] = [
      { key: 'dados', label: 'Dados do Canal' },
      { key: 'agentes', label: 'Agentes' },
    ];
    items.push({ key: 'config', label: 'Configuração' });
    if (channel.type === 'WHATSAPP_OFFICIAL') {
      items.push({ key: 'saude', label: 'Saúde' });
    }
    return items;
  }, [channel.type]);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-black">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200/60 dark:border-white/10">
            <Icon className="h-6 w-6 text-zinc-600 dark:text-zinc-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{channel.name}</h2>
            <p className="text-xs text-zinc-500">{meta.label}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          channel.isActive
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-zinc-100 text-zinc-500 dark:bg-black dark:text-zinc-400'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${channel.isActive ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
          {channel.isActive ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      {/* ── Pill-style Tab Navigation ── */}
      <nav className="border-b border-zinc-200 bg-zinc-50/50 px-6 py-3 dark:border-white/10 dark:bg-black/50">
        <div className="flex flex-wrap gap-2">
          {internalTabs.map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
                }`}
              >
                {t.key === 'dados' && <Info className="h-4 w-4 shrink-0" />}
                {t.key === 'agentes' && <Users className="h-4 w-4 shrink-0" />}
                {t.key === 'config' && <Shield className="h-4 w-4 shrink-0" />}
                {t.key === 'saude' && <Activity className="h-4 w-4 shrink-0" />}
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Tab Content ── */}
      <div>
        {tab === 'dados' && (
          <DataTab
            name={name}
            channel={channel}
            meta={meta}
            setName={setName}
            onSave={handleSaveCredentials}
            onTest={handleTest}
            onToggle={handleToggle}
            onToggleVisibility={handleToggleVisibility}
            onDelete={handleDelete}
            saving={saving}
            isTesting={isTesting}
            isSyncRunning={isSyncRunning}
            isSyncCompleted={isSyncCompleted}
            isSyncFailed={isSyncFailed}
            progressPct={progressPct}
            sync={sync}
          />
        )}
        {tab === 'agentes' && <AgentsTab channelId={channel.id} />}
        {tab === 'config' && (
          <ConfigTab
            channel={channel}
            config={config}
            setField={setField}
            fields={fields}
            webhookSecret={webhookSecret}
            setWebhookSecret={setWebhookSecret}
            webhookUrl={webhookUrl}
            copied={copied}
            handleCopyWebhook={handleCopyWebhook}
          />
        )}
        {tab === 'saude' && channel.type === 'WHATSAPP_OFFICIAL' && (
          <SaudeTab channelId={channel.id} config={channel.config ?? {}} />
        )}
      </div>
    </div>
  );
}

// ─── Dados do Canal Tab ─────────────────────────────

function DataTab({
  name, channel, meta, setName,
  onSave, onTest, onToggle, onToggleVisibility, onDelete,
  saving, isTesting,
  isSyncRunning, isSyncCompleted, isSyncFailed, progressPct, sync,
}: {
  name: string; channel: Channel; meta: { label: string; icon: React.ElementType };
  setName: (v: string) => void;
  onSave: () => void; onTest: () => void; onToggle: () => void;
  onToggleVisibility: () => void; onDelete: () => void;
  saving: boolean; isTesting: boolean;
  isSyncRunning: boolean; isSyncCompleted: boolean; isSyncFailed: boolean;
  progressPct: number;
  sync: ReturnType<typeof useChannelSync>;
}) {
  const queryClient = useQueryClient();
  const [orchId, setOrchId] = useState(channel.defaultOrchestratorId ?? '');
  const [savingOrch, setSavingOrch] = useState(false);

  useEffect(() => {
    setOrchId(channel.defaultOrchestratorId ?? '');
  }, [channel.defaultOrchestratorId]);

  const { data: agents = [] } = useQuery({
    queryKey: ['ai-agents'],
    queryFn: () => aiAgentsService.list(),
  });
  const orchestrators = agents.filter((a) => a.kind === 'ORCHESTRATOR');

  const handleSaveOrch = async () => {
    setSavingOrch(true);
    try {
      await channelsService.update(channel.id, {
        defaultOrchestratorId: orchId || null,
      });
      toast.success('Orquestrador padrão atualizado');
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar orquestrador');
    } finally { setSavingOrch(false); }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Nome do canal */}
      <div className="space-y-1.5">
        <label className={labelCls}>Nome do canal</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls.replace('font-mono', '')}
        />
      </div>

      {/* Tipo do canal (read-only) */}
      <div className="space-y-1.5">
        <label className={labelCls}>Tipo de canal</label>
        <div className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-black dark:text-zinc-400">
          <meta.icon className="h-4 w-4 shrink-0" />
          <span>{meta.label}</span>
        </div>
      </div>

      {/* Orquestrador padrão */}
      <div className="space-y-1.5">
        <label className={labelCls}>Orquestrador padrão</label>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Quando um cliente inicia conversa, este orquestrador será usado. Se não definido, o sistema usa o primeiro orquestrador AUTONOMOUS vinculado ao canal.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={orchId}
            onChange={(e) => setOrchId(e.target.value)}
            className="flex h-10 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          >
            <option value="">— Automático (primeiro orquestrador vinculado) —</option>
            {orchestrators.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.description ? ` — ${a.description}` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleSaveOrch}
            disabled={savingOrch}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {savingOrch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" />
          Salvar alterações
        </button>
        <button
          onClick={onTest}
          disabled={isTesting}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/10"
        >
          {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Testar Conexão
        </button>
        <button
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/10"
        >
          {channel.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          {channel.isActive ? 'Desativar' : 'Ativar'}
        </button>
        <button
          onClick={onToggleVisibility}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/10"
        >
          {channel.visibility === 'PRIVATE' ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {channel.visibility === 'PRIVATE' ? 'Público' : 'Privado'}
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/30 dark:bg-black dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-4 w-4" />
          Remover
        </button>
      </div>

      {/* Sync section */}
      {sync.supported && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Sincronização de histórico</p>
            {!isSyncRunning && (
              <button
                onClick={() => sync.startSync()}
                disabled={sync.loading}
                className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/10"
              >
                <RefreshCw className="h-3 w-3" />
                Sincronizar
              </button>
            )}
          </div>
          {sync.job && (
            <div className="mt-3">
              {isSyncRunning && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Sincronizando
                    </span>
                    <button onClick={() => sync.cancelSync()} className="text-xs text-zinc-500 hover:text-red-600">
                      Cancelar
                    </button>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-black">
                    <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}
              {isSyncCompleted && (
                <p className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {sync.job.conversationsImported} conversas, {sync.job.messagesImported} mensagens
                </p>
              )}
              {isSyncFailed && (
                <p className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  Falhou: {sync.job.errorMessage || 'erro desconhecido'}
                </p>
              )}
              {sync.job.status === 'CANCELLED' && (
                <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                  <XCircle className="h-3 w-3" />
                  Cancelada
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Agentes Tab ──────────────────────────────────────

function AgentsTab({ channelId }: { channelId: string }) {
  const queryClient = useQueryClient();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['channel-agents', channelId],
    queryFn: () => channelAccessService.listChannelAgents(channelId),
  });

  // TODOS os membros ativos da org — pra poder conceder acesso a qualquer um
  // (o antigo listEligibleAgents só trazia quem já tinha grant, então nunca
  // aparecia ninguém novo pra adicionar).
  const { data: members } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => membersService.list(),
  });

  const { data: aiAgents, isLoading: loadingAi } = useQuery({
    queryKey: ['ai-agents'],
    queryFn: () => aiAgentsService.list(),
  });

  const linkedBots = (aiAgents ?? []).filter((agent) =>
    agent.channels?.some((link) => link.channelId === channelId),
  );
  const unlinkedBots = (aiAgents ?? []).filter(
    (agent) => !agent.channels?.some((link) => link.channelId === channelId),
  );

  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAddAi, setShowAddAi] = useState(false);
  const [linkingAi, setLinkingAi] = useState(false);

  const handleAdd = async (userId: string) => {
    setAdding(true);
    try {
      await channelAccessService.addChannelAgent(channelId, userId);
      toast.success('Membro adicionado ao canal');
      queryClient.invalidateQueries({ queryKey: ['channel-agents', channelId] });
      setShowAdd(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar membro');
    } finally { setAdding(false); }
  };

  const handleRemove = async (userId: string, name: string) => {
    const ok = window.confirm(`Remover ${name} do acesso a este canal?`);
    if (!ok) return;
    try {
      await channelAccessService.removeChannelAgent(channelId, userId);
      toast.success('Acesso removido');
      queryClient.invalidateQueries({ queryKey: ['channel-agents', channelId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover membro');
    }
  };

  const handleLinkAi = async (agentId: string) => {
    setLinkingAi(true);
    try {
      await aiAgentsService.assignChannel(agentId, { channelId });
      toast.success('Agente de IA vinculado ao canal');
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      setShowAddAi(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao vincular agente de IA');
    } finally { setLinkingAi(false); }
  };

  const handleUnlinkAi = async (agentId: string, name: string) => {
    const ok = window.confirm(`Desvincular o agente "${name}" deste canal?`);
    if (!ok) return;
    try {
      await aiAgentsService.unassignChannel(agentId, channelId);
      toast.success('Agente de IA desvinculado');
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desvincular agente de IA');
    }
  };

  const notInChannel = (members ?? [])
    .filter((m) => m.user.isActive)
    .filter((m) => !(agents ?? []).some((a) => a.user.id === m.user.id));

  return (
    <div className="space-y-6 p-6">
      {/* ── Membros humanos ── */}
      <section className="rounded-lg border border-zinc-200 dark:border-white/10">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-400" />
            <div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Membros humanos</p>
              <p className="text-xs text-zinc-400">
                Pessoas da equipe com acesso a este canal
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>

        <div className="px-4 py-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-50 dark:bg-black" />
              ))}
            </div>
          ) : !agents?.length ? (
            <p className="py-6 text-center text-sm text-zinc-400">
              Nenhum membro com acesso explícito a este canal
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-white/5">
              {agents.map((agent) => (
                <div key={agent.grantId} className="flex items-center justify-between py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
                      {agent.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {agent.user.name}
                      </p>
                      <p className="truncate text-xs text-zinc-400">{agent.user.email}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                      {agent.role}
                    </span>
                    <button
                      onClick={() => handleRemove(agent.user.id, agent.user.name)}
                      className="rounded-md p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      title="Remover acesso"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Agentes de IA (bots) ── */}
      <section className="rounded-lg border border-zinc-200 dark:border-white/10">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Agentes de IA (bots)</p>
              <p className="text-xs text-zinc-400">
                Bots que respondem neste canal
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddAi(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-600"
          >
            <Bot className="h-3.5 w-3.5" />
            Adicionar IA
          </button>
        </div>

        <div className="px-4 py-3">
          {loadingAi ? (
            <div className="h-12 animate-pulse rounded-lg bg-zinc-50 dark:bg-black" />
          ) : linkedBots.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">
              Nenhum agente de IA vinculado a este canal
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-white/5">
              {linkedBots.map((bot) => {
                const link = bot.channels?.find((c) => c.channelId === channelId);
                return (
                  <div key={bot.id} className="flex items-center justify-between py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-medium text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {bot.name}
                        </p>
                        <p className="truncate text-xs text-zinc-400">
                          {bot.description || bot.kind}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {link && (
                        <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-medium uppercase text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                          {link.mode}
                        </span>
                      )}
                      <button
                        onClick={() => handleUnlinkAi(bot.id, bot.name)}
                        className="rounded-md p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                        title="Desvincular do canal"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Add member dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-white/10">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Adicionar membro ao canal
              </h3>
              <button onClick={() => setShowAdd(false)} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3">
              {notInChannel.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-400">
                  Todos os membros da equipe já têm acesso a este canal
                </p>
              ) : (
                <div className="space-y-1">
                  {notInChannel.map((member) => (
                    <button
                      key={member.user.id}
                      onClick={() => handleAdd(member.user.id)}
                      disabled={adding}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-white/5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
                        {member.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {member.user.name}
                        </p>
                        <p className="truncate text-xs text-zinc-400">{member.user.email}</p>
                      </div>
                      <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                        {member.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add AI agent dialog */}
      {showAddAi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-white/10">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Vincular agente de IA ao canal
              </h3>
              <button onClick={() => setShowAddAi(false)} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3">
              {unlinkedBots.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-400">
                  Todos os agentes de IA já estão vinculados a este canal
                </p>
              ) : (
                <div className="space-y-1">
                  {unlinkedBots.map((bot) => (
                    <button
                      key={bot.id}
                      onClick={() => handleLinkAi(bot.id)}
                      disabled={linkingAi}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-violet-50 disabled:opacity-50 dark:hover:bg-violet-900/10"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {bot.name}
                        </p>
                        <p className="truncate text-xs text-zinc-400">{bot.description || bot.kind}</p>
                      </div>
                      <span className="shrink-0 rounded bg-violet-100 px-2 py-0.5 text-[10px] font-medium uppercase text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                        {bot.kind}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Configuração Tab ─────────────────────────────

interface FieldDef { key: string; label: string; placeholder?: string; hint?: string; optional?: boolean; }

function ConfigTab({
  channel, config, setField, fields,
  webhookSecret, setWebhookSecret,
  webhookUrl, copied, handleCopyWebhook,
}: {
  channel: Channel;
  config: Record<string, string>;
  setField: (k: string, v: string) => void;
  fields: FieldDef[];
  webhookSecret: string;
  setWebhookSecret: (v: string) => void;
  webhookUrl: string;
  copied: boolean;
  handleCopyWebhook: () => void;
}) {
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});

  const toggleVisible = (key: string) =>
    setVisibleFields((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-6 p-6">
      {/* Credential fields with eye toggle */}
      {fields.map((f) => (
        <ConfigField
          key={f.key}
          label={f.label}
          value={config[f.key] ?? ''}
          onChange={(v) => setField(f.key, v)}
          placeholder={f.placeholder}
          isVisible={!!visibleFields[f.key]}
          onToggleVisibility={() => toggleVisible(f.key)}
          optional={f.optional}
          hint={f.hint}
        />
      ))}

      {/* Webhook Secret */}
      <ConfigField
        label="Webhook Secret"
        value={webhookSecret}
        onChange={setWebhookSecret}
        placeholder="Chave secreta para validar webhooks recebidos"
        isVisible={!!visibleFields['__webhookSecret__']}
        onToggleVisibility={() => toggleVisible('__webhookSecret__')}
        optional
        hint="Usado para validar a autenticidade dos payloads recebidos via webhook"
      />

      {/* Webhook URL — always visible at bottom */}
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
          URL do Webhook (configure no painel do provedor)
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-700 dark:bg-black dark:text-zinc-300">
            {webhookUrl}
          </code>
          <button
            onClick={handleCopyWebhook}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {channel.type === 'INSTAGRAM' && <WebhookDiagnostics channelId={channel.id} />}
    </div>
  );
}

function WebhookDiagnostics({ channelId }: { channelId: string }) {
  const [loading, setLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof channelsService.webhookDiagnostics>
  > | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      setData(await channelsService.webhookDiagnostics(channelId));
    } catch {
      // silencioso — o botão pode ser tentado de novo
    } finally {
      setLoading(false);
    }
  };

  const subscribe = async () => {
    setSubscribing(true);
    try {
      const r = await channelsService.instagramSubscribe(channelId);
      if (r.ok) {
        toast.success('App inscrito nos webhooks! Agora mande uma DM de teste.');
      } else {
        toast.error(`Falha ao inscrever: ${r.error ?? 'erro desconhecido'}`);
      }
    } catch {
      toast.error('Falha ao inscrever o app nos webhooks.');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            Diagnóstico de webhook
          </p>
          <p className="text-[11px] text-zinc-500">
            Mostra os últimos webhooks que a Meta enviou. Mande uma DM de outra
            conta e clique em Verificar.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={subscribe}
            disabled={subscribing}
            title="Inscreve o app pra receber DMs e comentários reais (não só o Teste da Meta)"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {subscribing ? 'Ativando…' : 'Ativar recebimento'}
          </button>
          <button
            onClick={run}
            disabled={loading}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            {loading ? 'Verificando…' : 'Verificar'}
          </button>
        </div>
      </div>

      {data && (
        <div className="mt-3 space-y-2 text-xs">
          <p className="text-zinc-500">
            ID configurado no canal:{' '}
            <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-black">
              {data.configuredIds.join(', ') || '—'}
            </code>
          </p>
          {data.totalReceived === 0 ? (
            <div className="rounded-md bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <strong>Nenhum webhook chegou ainda.</strong> Provavelmente o app
              está em <strong>modo Desenvolvimento</strong> (só entrega mensagens
              de contas com papel no app) ou o campo <code>messages</code> não
              foi assinado. Coloque o app em Produção ou adicione a conta de
              teste como papel no app na Meta.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {data.events.map((e, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-zinc-50 px-2.5 py-1.5 dark:bg-black"
                >
                  <span className="text-zinc-400">
                    {new Date(e.receivedAt).toLocaleString('pt-BR')}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300">
                    {e.kinds.join(', ') || 'evento'}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      e.status === 'PROCESSED'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : e.status === 'UNROUTED'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                          : e.status === 'FAILED'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                            : 'bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                    }`}
                  >
                    {e.status === 'UNROUTED'
                      ? 'não casou com o canal'
                      : e.status === 'PROCESSED'
                        ? 'processado ✓'
                        : e.status}
                  </span>
                  {!e.idMatches && e.entryIds.length > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      veio id {e.entryIds.join(', ')} — diferente do configurado
                    </span>
                  )}
                  {e.errorMessage && (
                    <span className="w-full text-orange-600 dark:text-orange-400">
                      {e.errorMessage}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigField({
  label, value, onChange, placeholder, isVisible, onToggleVisibility, optional, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
  optional?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>
        {label} {optional && <span className="text-zinc-400">(opcional)</span>}
      </label>
      <div className="relative">
        <input
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputCls} pr-10`}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          title={isVisible ? 'Ocultar' : 'Mostrar'}
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

// ─── Saúde Tab ──────────────────────────────────────

function SaudeTab({ channelId, config }: { channelId: string; config: Record<string, any> }) {
  const { data: health, isLoading, error, refetch } = useQuery({
    queryKey: ['whatsapp-health', channelId],
    queryFn: () => channelsService.getWhatsAppHealth(channelId),
    refetchInterval: 30000,
    staleTime: 10000,
  });

  if (isLoading) return <HealthSkeleton />;

  if (error || !health) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-zinc-500">Não foi possível carregar as informações de saúde</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  return <HealthContent health={health} config={config} />;
}

function HealthSkeleton() {
  return (
    <div className="space-y-4 p-6 animate-pulse">
      <div className="h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      </div>
      <div className="h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

import type { WhatsAppHealth } from '../services/channels.service';

function HealthContent({ health, config }: { health: WhatsAppHealth; config: Record<string, any> }) {
  // ── Quality Rating ──
  const qualityLabel =
    health.qualityRating === 'GREEN' ? 'Verde'
    : health.qualityRating === 'YELLOW' ? 'Amarelo'
    : health.qualityRating === 'RED' ? 'Vermelho'
    : 'Indisponível';

  const qualityColor =
    health.qualityRating === 'GREEN' ? 'text-emerald-600 dark:text-emerald-400'
    : health.qualityRating === 'YELLOW' ? 'text-amber-600 dark:text-amber-400'
    : health.qualityRating === 'RED' ? 'text-red-600 dark:text-red-400'
    : 'text-zinc-500 dark:text-zinc-400';

  // ── Name Status ──
  const isNameVerified =
    health.businessNameStatus === 'ACCEPTED' || health.codeVerificationStatus === 'VERIFIED';
  const isNameRejected =
    health.codeVerificationStatus === 'NOT_VERIFIED' || health.businessNameStatus === 'REJECTED';

  const nameStatusLabel =
    health.businessNameStatus === 'ACCEPTED' ? 'Aceito ✓'
    : health.codeVerificationStatus === 'VERIFIED' ? 'Verificado ✓'
    : health.businessNameStatus === 'REJECTED' ? 'Rejeitado ✗'
    : health.codeVerificationStatus === 'NOT_VERIFIED' ? 'Não verificado'
    : health.businessNameStatus === 'PENDING' ? 'Pendente'
    : '—';

  const nameStatusColor = isNameVerified
    ? 'text-emerald-600 dark:text-emerald-400'
    : isNameRejected
      ? 'text-red-600 dark:text-red-400'
      : 'text-zinc-700 dark:text-zinc-300';

  // ── Account Mode ──
  const accountModeLabel =
    health.accountMode === 'LIVE' ? 'Produção (Live)'
    : health.accountMode === 'DEVELOPMENT' ? 'Desenvolvimento'
    : '—';

  const accountModeColor =
    health.accountMode === 'LIVE'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-zinc-700 dark:text-zinc-300';

  // ── Webhook ──
  const webhookLabel =
    health.webhookConfigured && health.webhookValid
      ? 'Configurado e ativo'
      : health.webhookConfigured
        ? 'Configurado mas inativo'
        : 'Não configurado';

  const webhookColor =
    health.webhookConfigured && health.webhookValid
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400';

  // ── Facebook Business Manager URL ──
  const phoneNumberId = config.phoneNumberId;
  const businessAccountId = config.businessAccountId;
  const fbUrl = phoneNumberId && businessAccountId
    ? `https://business.facebook.com/latest/whatsapp_manager/phone_numbers/?asset_id=${phoneNumberId}&business_id=${businessAccountId}&ir_qe_exposed=1&tab=phone-numbers`
    : null;

  return (
    <div className="space-y-4 p-6">
      {/* Top row: phone number + business name */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard icon={Phone} label="Número exibido" value={health.phoneNumber || '—'} />
        <InfoCard icon={Building2} label="Nome da empresa" value={health.phoneName || health.businessName || '—'} />
      </div>

      {/* Second row: quality rating + name status */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard icon={Activity} label="Classificação de qualidade" value={qualityLabel} valueColor={qualityColor} />
        <InfoCard icon={Shield} label="Status do nome" value={nameStatusLabel} valueColor={nameStatusColor} />
      </div>

      {/* Third row: account mode + webhook (same line) */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard icon={Radio} label="Modo da conta" value={accountModeLabel} valueColor={accountModeColor} />
        <InfoCard icon={Webhook} label="Webhook" value={webhookLabel} valueColor={webhookColor} />
      </div>

      {/* Facebook Business Manager button — blue */}
      {fbUrl && (
        <div className="pt-2">
          <a
            href={fbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            Revisar dados no Facebook Business Manager
          </a>
        </div>
      )}

      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
        Última atualização: {new Date(health.lastFetched).toLocaleTimeString('pt-BR')}
      </p>
    </div>
  );
}

function InfoCard({
  icon: Icon, label, value, valueColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3.5 dark:border-white/10 dark:bg-black">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {label}
          </p>
          <p className={`mt-0.5 truncate text-sm font-semibold ${valueColor ?? 'text-zinc-700 dark:text-zinc-300'}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Field definitions ──────────────────────────────

function fieldsFor(type: Channel['type']): FieldDef[] {
  if (type === 'WHATSAPP_OFFICIAL') {
    return [
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: 'Encontrado no Meta Business Suite' },
      { key: 'accessToken', label: 'Access Token', placeholder: 'System User Token ou Temporary Token' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'Chave secreta do app (Settings → Basic na Meta)' },
      { key: 'businessAccountId', label: 'Business Account ID (WABA)', placeholder: 'Habilita auto-subscribe do webhook', optional: true },
    ];
  }
  if (type === 'WHATSAPP_ZAPPFY') {
    return [
      { key: 'token', label: 'Token', placeholder: 'Token da instância Zappfy' },
    ];
  }
  if (type === 'INSTAGRAM') {
    return [
      { key: 'accessToken', label: 'Access Token', placeholder: 'O mesmo IG_ACCESS_TOKEN dos agentes' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'Chave secreta do app' },
      { key: 'igBusinessId', label: 'Instagram Business ID', placeholder: 'O mesmo IG_USER_ID das Variáveis' },
      { key: 'fbPageId', label: 'Facebook Page ID', placeholder: 'O FB_PAGE_ID das Variáveis — necessário pra receber DMs', hint: 'A Página do Facebook vinculada ao Instagram. Sem ela, a Meta não entrega as mensagens (é onde o app é inscrito).' },
      { key: 'igAppId', label: 'Instagram App ID', optional: true },
    ];
  }
  if (type === 'TELEGRAM') {
    return [
      { key: 'botToken', label: 'Bot Token', placeholder: 'Token do BotFather' },
      { key: 'botUsername', label: 'Bot Username', placeholder: 'ex: axory_suporte_bot', optional: true },
      { key: 'secretToken', label: 'Secret Token', placeholder: 'Mesmo token configurado no webhook' },
    ];
  }
  return [];
}
