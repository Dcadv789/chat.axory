'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Send, Plus, X, Loader2, Users, CheckCircle2, AlertCircle, Trash2, Play,
  Megaphone, Ban, Clock,
} from 'lucide-react';
import { campaignsService, type Campaign, type CreateCampaignInput } from '@/features/campaigns/services/campaigns.service';
import { channelsService, type Channel, type WhatsappTemplate } from '@/features/channels/services/channels.service';
import { tagsService } from '@/features/settings/services/tags.service';
import { contactsService } from '@/features/contacts/services/contacts.service';
import { useOrgId } from '@/hooks/use-org-query-key';

const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white py-2.5 px-3 text-sm placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100';

const STATUS: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  DRAFT: { label: 'Rascunho', cls: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300', icon: Clock },
  SENDING: { label: 'Enviando', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300', icon: Loader2 },
  COMPLETED: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300', icon: CheckCircle2 },
  CANCELED: { label: 'Cancelada', cls: 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400', icon: Ban },
  FAILED: { label: 'Falhou', cls: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300', icon: AlertCircle },
};

export default function CampaignsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns', orgId],
    queryFn: () => campaignsService.list(),
    refetchInterval: 5000, // acompanha o progresso em quase-tempo-real
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['campaigns'] });

  const send = async (c: Campaign) => {
    if (!window.confirm(`Disparar a campanha "${c.name}" para ${c.total} contatos agora?`)) return;
    try {
      await campaignsService.send(c.id);
      toast.success('Campanha em envio!');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao disparar');
    }
  };
  const cancel = async (c: Campaign) => {
    if (!window.confirm(`Cancelar a campanha "${c.name}"? Os envios pendentes serão interrompidos.`)) return;
    try { await campaignsService.cancel(c.id); toast.success('Campanha cancelada'); refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao cancelar'); }
  };
  const remove = async (c: Campaign) => {
    if (!window.confirm(`Remover a campanha "${c.name}"?`)) return;
    try { await campaignsService.remove(c.id); toast.success('Campanha removida'); refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao remover'); }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho — mesma altura/padrão dos demais painéis (h-16). */}
      <header className="flex h-16 shrink-0 items-center border-b border-zinc-200 bg-white px-6 dark:border-white/10 dark:bg-black">
        <div className="flex min-w-0 items-center gap-2">
          <Send className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight text-zinc-950 dark:text-zinc-50">Campanhas</h1>
            <p className="truncate text-xs text-zinc-500">Dispare mensagens em massa por WhatsApp, Instagram ou Telegram</p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">Dispare uma mensagem para uma lista de contatos por um canal.</p>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nova campanha
          </button>
        </div>

        <div className="mt-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />)
        ) : campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 py-16 text-center dark:border-white/10">
            <Send className="mx-auto h-10 w-10 text-zinc-200 dark:text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-500">Nenhuma campanha ainda</p>
          </div>
        ) : (
          campaigns.map((c) => {
            const st = STATUS[c.status] ?? STATUS.DRAFT;
            const StIcon = st.icon;
            const done = c.sentCount + c.failedCount;
            const pct = c.total > 0 ? Math.round((done / c.total) * 100) : 0;
            return (
              <div key={c.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{c.name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>
                        <StIcon className={`h-3 w-3 ${c.status === 'SENDING' ? 'animate-spin' : ''}`} /> {st.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {c.channelType.replace('_', ' ')} · {c.messageType === 'TEMPLATE' ? 'Template' : 'Texto'} · {c.total} destinatários
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {c.status === 'DRAFT' && (
                      <>
                        <button onClick={() => send(c)} className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"><Play className="h-3.5 w-3.5" /> Disparar</button>
                        <button onClick={() => remove(c)} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                    {c.status === 'SENDING' && (
                      <button onClick={() => cancel(c)} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300"><Ban className="h-3.5 w-3.5" /> Cancelar</button>
                    )}
                    {(c.status === 'COMPLETED' || c.status === 'CANCELED' || c.status === 'FAILED') && (
                      <button onClick={() => remove(c)} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>

                {(c.status === 'SENDING' || c.status === 'COMPLETED') && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500">
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">{c.sentCount} enviados</span>
                      {c.failedCount > 0 && <span className="ml-2 text-red-500">{c.failedCount} falhas</span>}
                      <span className="ml-2 text-zinc-400">de {c.total}</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
        </div>
      </div>

      {creating && <CreateCampaignDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />}
    </div>
  );
}

// ─── Criar campanha ────────────────────────────────────

function CreateCampaignDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const orgId = useOrgId();
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [text, setText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [audMode, setAudMode] = useState<'all' | 'tag' | 'campaign'>('all');
  const [audTag, setAudTag] = useState('');
  const [audCampaign, setAudCampaign] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: channels = [] } = useQuery({ queryKey: ['channels', orgId], queryFn: () => channelsService.list() });
  const { data: tags = [] } = useQuery({ queryKey: ['tags', orgId], queryFn: () => tagsService.list() });
  const { data: campaignNames = [] } = useQuery({ queryKey: ['contact-campaigns', orgId], queryFn: () => contactsService.listCampaigns() });

  // Só canais que enviam (exclui INTERNAL).
  const sendable = channels.filter((c: Channel) => c.type !== 'INTERNAL' && c.isActive);
  const channel = sendable.find((c) => c.id === channelId);
  const isWaOfficial = channel?.type === 'WHATSAPP_OFFICIAL';

  const { data: templates = [] } = useQuery({
    queryKey: ['wa-templates', channelId],
    queryFn: () => channelsService.listWhatsappTemplates(channelId),
    enabled: isWaOfficial && !!channelId,
  });
  const approved = (templates as WhatsappTemplate[]).filter((t) => t.status === 'APPROVED');
  const selectedTemplate = approved.find((t) => t.name === templateName);
  const templateVarCount = selectedTemplate ? countBodyVars(selectedTemplate) : 0;

  // Ajusta o array de params ao número de variáveis do template.
  useEffect(() => {
    setTemplateParams((prev) => {
      const next = [...prev];
      next.length = templateVarCount;
      return Array.from(next, (v) => v ?? '');
    });
  }, [templateVarCount, templateName]);

  // Prévia da audiência (debounced-ish via effect nas deps).
  useEffect(() => {
    let active = true;
    const audience = { mode: audMode, ...(audMode === 'tag' ? { tagId: audTag } : {}), ...(audMode === 'campaign' ? { campaign: audCampaign } : {}) };
    if ((audMode === 'tag' && !audTag) || (audMode === 'campaign' && !audCampaign)) { setCount(null); return; }
    campaignsService.previewAudience(audience).then((n) => active && setCount(n)).catch(() => active && setCount(null));
    return () => { active = false; };
  }, [audMode, audTag, audCampaign]);

  const create = async () => {
    if (!name.trim()) return toast.error('Dê um nome à campanha.');
    if (!channelId) return toast.error('Escolha o canal.');
    setSaving(true);
    try {
      const input: CreateCampaignInput = {
        name: name.trim(),
        channelId,
        messageType: isWaOfficial ? 'TEMPLATE' : 'TEXT',
        audience: { mode: audMode, ...(audMode === 'tag' ? { tagId: audTag } : {}), ...(audMode === 'campaign' ? { campaign: audCampaign } : {}) },
        ...(isWaOfficial
          ? { templateName, templateLanguage: selectedTemplate?.language, templateBodyParams: templateParams }
          : { text }),
      };
      await campaignsService.create(input);
      toast.success('Campanha criada! Revise e clique em Disparar.');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar campanha');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nova campanha</h3>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Field label="Nome da campanha"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Ex: Promoção de Julho" /></Field>

          <Field label="Canal de envio">
            <select value={channelId} onChange={(e) => { setChannelId(e.target.value); setTemplateName(''); }} className={inputCls}>
              <option value="">Selecione um canal…</option>
              {sendable.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type.replace('_', ' ')})</option>)}
            </select>
          </Field>

          {/* Mensagem: template (WhatsApp Official) ou texto livre */}
          {channelId && (isWaOfficial ? (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
                WhatsApp Official/Coex: por regra da Meta, disparo em massa só com <strong>template aprovado</strong>.
              </div>
              <Field label="Template">
                <select value={templateName} onChange={(e) => setTemplateName(e.target.value)} className={inputCls}>
                  <option value="">Selecione um template aprovado…</option>
                  {approved.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.language})</option>)}
                </select>
                {approved.length === 0 && <p className="mt-1 text-[11px] text-zinc-400">Nenhum template aprovado. Sincronize em Configurações → Templates WhatsApp.</p>}
              </Field>
              {templateVarCount > 0 && (
                <Field label={`Variáveis do template (${templateVarCount})`}>
                  <div className="space-y-2">
                    {Array.from({ length: templateVarCount }).map((_, i) => (
                      <input
                        key={i}
                        value={templateParams[i] ?? ''}
                        onChange={(e) => setTemplateParams((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                        className={inputCls}
                        placeholder={`Valor de {{${i + 1}}} — use {{nome}} para o nome do contato`}
                      />
                    ))}
                  </div>
                </Field>
              )}
            </>
          ) : (
            <Field label="Mensagem">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={inputCls} placeholder="Escreva a mensagem… use {{nome}} para inserir o nome do contato." />
              <p className="mt-1 text-[11px] text-zinc-400">{'Dica: {{nome}} vira o nome do contato no envio.'}</p>
            </Field>
          ))}

          {/* Audiência */}
          <Field label="Destinatários">
            <div className="flex gap-2">
              {(['all', 'tag', 'campaign'] as const).map((m) => (
                <button key={m} onClick={() => setAudMode(m)} className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${audMode === m ? 'bg-primary text-primary-foreground' : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300'}`}>
                  {m === 'all' ? 'Todos' : m === 'tag' ? 'Por tag' : 'Por campanha'}
                </button>
              ))}
            </div>
            {audMode === 'tag' && (
              <select value={audTag} onChange={(e) => setAudTag(e.target.value)} className={`${inputCls} mt-2`}>
                <option value="">Escolha a tag…</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {audMode === 'campaign' && (
              <select value={audCampaign} onChange={(e) => setAudCampaign(e.target.value)} className={`${inputCls} mt-2`}>
                <option value="">Escolha a campanha (origem do contato)…</option>
                {campaignNames.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {count !== null && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                <Users className="h-3.5 w-3.5 text-primary" /> {count} contato{count === 1 ? '' : 's'} nesta audiência
              </p>
            )}
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-white/10">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10">Cancelar</button>
          <button onClick={create} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />} Criar campanha
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      {children}
    </div>
  );
}

/** Conta as variáveis {{N}} do corpo (BODY) de um template do WhatsApp. */
function countBodyVars(t: WhatsappTemplate): number {
  const comps = Array.isArray(t.components) ? t.components : [];
  const body = comps.find((c: any) => String(c?.type).toUpperCase() === 'BODY');
  const text: string = body?.text ?? '';
  const set = new Set((text.match(/\{\{\s*\d+\s*\}\}/g) ?? []).map((s) => s.replace(/\D/g, '')));
  return set.size;
}
