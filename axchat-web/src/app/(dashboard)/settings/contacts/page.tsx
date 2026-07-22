'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search, Users, MessageSquare, Plus, Upload, Download, X, Loader2,
  Tag as TagIcon, Megaphone, Trash2, Save,
} from 'lucide-react';
import { contactsService, type Contact, type ImportContactRow } from '@/features/contacts/services/contacts.service';
import { tagsService, type Tag } from '@/features/settings/services/tags.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { ZappfyIcon, MetaIcon, InstagramIcon, TelegramIcon } from '@/components/ui/icons';

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP_ZAPPFY: ZappfyIcon,
  WHATSAPP_OFFICIAL: MetaIcon,
  INSTAGRAM: InstagramIcon,
  TELEGRAM: TelegramIcon,
};

const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white py-2.5 px-3 text-sm placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100';

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', orgId, search, tagFilter, campaignFilter, page],
    queryFn: () =>
      contactsService.list({
        search,
        ...(tagFilter ? { tagId: tagFilter } : {}),
        ...(campaignFilter ? { campaign: campaignFilter } : {}),
        page: String(page),
        limit: '20',
      }),
  });
  const { data: tags = [] } = useQuery({ queryKey: ['tags', orgId], queryFn: () => tagsService.list() });
  const { data: campaigns = [] } = useQuery({ queryKey: ['contact-campaigns', orgId], queryFn: () => contactsService.listCampaigns() });

  const contacts = data?.contacts || [];
  const pagination = data?.pagination;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    queryClient.invalidateQueries({ queryKey: ['contact-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['tags'] });
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className={`${inputCls} pl-10`}
          />
        </div>

        <select
          value={tagFilter}
          onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
          className="h-[42px] rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus:border-primary focus:outline-none dark:border-white/10 dark:bg-black dark:text-zinc-200"
        >
          <option value="">Todas as tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select
          value={campaignFilter}
          onChange={(e) => { setCampaignFilter(e.target.value); setPage(1); }}
          className="h-[42px] rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 focus:border-primary focus:outline-none dark:border-white/10 dark:bg-black dark:text-zinc-200"
        >
          <option value="">Todas as campanhas</option>
          {campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="ml-auto flex gap-2">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <Download className="h-4 w-4" /> Modelo
          </button>
          <button
            onClick={() => setImporting(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <Upload className="h-4 w-4" /> Importar
          </button>
          <button
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Novo contato
          </button>
        </div>
      </div>

      {pagination && (
        <p className="mt-2 text-xs text-zinc-500">{pagination.total} contatos</p>
      )}

      <div className="mt-3 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
        <table className="w-full table-fixed shrink-0">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
              <th className="w-[26%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Contato</th>
              <th className="w-[16%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Telefone</th>
              <th className="w-[16%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Canais</th>
              <th className="w-[18%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Tags</th>
              <th className="w-[16%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Campanha</th>
              <th className="w-[8%] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">Conv.</th>
            </tr>
          </thead>
        </table>

        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[26%]" /><col className="w-[16%]" /><col className="w-[16%]" />
              <col className="w-[18%]" /><col className="w-[16%]" /><col className="w-[8%]" />
            </colgroup>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-zinc-50 dark:border-white/10">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" /></td>
                    ))}
                  </tr>
                ))
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <Users className="mx-auto h-10 w-10 text-zinc-200 dark:text-zinc-700" />
                    <p className="mt-3 text-sm text-zinc-500">Nenhum contato encontrado</p>
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => setEditing(contact)}
                    className="cursor-pointer border-b border-zinc-50 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/10"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-black dark:text-zinc-300">
                          {(contact.name || '??').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{contact.name || 'Sem nome'}</p>
                          {contact.email && <p className="truncate text-[11px] text-zinc-400">{contact.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 truncate">{contact.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contact.channels.map((ch) => {
                          const Icon = channelIcons[ch.channel.type] || MessageSquare;
                          return (
                            <span key={ch.id} className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-black">
                              <Icon className="h-3 w-3" />
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.map((t) => (
                          <span key={t.tag.id} className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white truncate max-w-24" style={{ backgroundColor: t.tag.color }}>
                            {t.tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {contact.campaign ? (
                        <span className="inline-flex items-center gap-1 truncate rounded bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
                          <Megaphone className="h-3 w-3 shrink-0" /> {contact.campaign}
                        </span>
                      ) : <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-zinc-600 dark:text-zinc-400">{contact._count?.conversations || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-white/10">
            <p className="text-xs text-zinc-500">Página {pagination.page} de {pagination.totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/10">Anterior</button>
              <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="rounded px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/10">Próxima</button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <ContactDialog
          contact={editing === 'new' ? null : editing}
          tags={tags}
          campaigns={campaigns}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {importing && (
        <ImportDialog onClose={() => setImporting(false)} onDone={() => { setImporting(false); refresh(); }} />
      )}
    </div>
  );
}

// ─── Criar/Editar contato ──────────────────────────────

function ContactDialog({
  contact, tags, campaigns, onClose, onSaved,
}: {
  contact: Contact | null;
  tags: Tag[];
  campaigns: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !contact;
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [campaign, setCampaign] = useState(contact?.campaign ?? '');
  const [tagIds, setTagIds] = useState<string[]>(contact?.tags.map((t) => t.tag.id) ?? []);
  const [saving, setSaving] = useState(false);

  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const selectedNames = tags.filter((t) => tagIds.includes(t.id)).map((t) => t.name);
        await contactsService.create({ name, phone, email, campaign, tags: selectedNames });
        toast.success('Contato criado');
      } else {
        await contactsService.update(contact!.id, { name, phone, email, campaign, tagIds });
        toast.success('Contato atualizado');
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar contato');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!contact) return;
    if (!window.confirm(`Remover o contato "${contact.name || contact.phone || 'sem nome'}"?`)) return;
    try {
      await contactsService.remove(contact.id);
      toast.success('Contato removido');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{isNew ? 'Novo contato' : 'Editar contato'}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Nome do contato" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="5511999999999" /></Field>
            <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@exemplo.com" /></Field>
          </div>
          <Field label="Campanha">
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className={inputCls} placeholder="Ex: Black Friday 2026" list="campaign-suggestions" />
            <datalist id="campaign-suggestions">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Tags">
            {tags.length === 0 ? (
              <p className="text-xs text-zinc-400">Nenhuma tag criada. Crie tags em Configurações → Tags.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${on ? 'text-white' : 'text-zinc-500 ring-1 ring-inset ring-zinc-200 dark:ring-white/10'}`}
                      style={on ? { backgroundColor: t.color } : undefined}
                    >
                      <TagIcon className="h-3 w-3" /> {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 dark:border-white/10">
          {!isNew ? (
            <button onClick={remove} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20">
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </button>
          ) : <span />}
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Importar planilha ─────────────────────────────────

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ImportContactRow[] | null>(null);
  const [campaign, setCampaign] = useState('');
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseContactsCsv(text);
      if (parsed.length === 0) { toast.error('Planilha vazia ou sem colunas reconhecidas (name, phone, email, campaign, tags).'); return; }
      setRows(parsed);
    } catch {
      toast.error('Não consegui ler o arquivo. Use o modelo CSV.');
    }
  };

  const submit = async () => {
    if (!rows) return;
    setImporting(true);
    try {
      const res = await contactsService.importContacts(rows, campaign.trim() || undefined);
      toast.success(`Importação concluída: ${res.created} criados, ${res.updated} atualizados${res.skipped ? `, ${res.skipped} ignorados` : ''}.`);
      if (res.errors?.length) toast.error(`${res.errors.length} linha(s) com erro (veja o console).`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar');
    } finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Importar contatos por planilha</h3>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-relaxed text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100">
            Suba um arquivo <strong>CSV</strong> com as colunas <code>name, phone, email, campaign, tags</code>.
            As <strong>tags</strong> podem vir separadas por <code>;</code>. Contatos com o mesmo telefone/email são atualizados (não duplicam).{' '}
            <button onClick={downloadTemplate} className="font-medium underline">Baixar modelo</button>.
          </div>

          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 py-6 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:bg-black dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <Upload className="h-5 w-5" /> {fileName || 'Escolher arquivo CSV'}
          </button>

          {rows && (
            <>
              <p className="text-xs text-zinc-500">
                <strong className="text-zinc-700 dark:text-zinc-200">{rows.length}</strong> contatos lidos. Prévia dos 3 primeiros:
              </p>
              <div className="overflow-hidden rounded-lg border border-zinc-200 text-xs dark:border-white/10">
                {rows.slice(0, 3).map((r, i) => (
                  <div key={i} className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-zinc-100 px-3 py-1.5 last:border-0 dark:border-white/5">
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">{r.name || '(sem nome)'}</span>
                    <span className="text-zinc-500">{r.phone || '—'}</span>
                    <span className="text-zinc-400">{r.email || ''}</span>
                    {r.tags?.length ? <span className="text-violet-500">{r.tags.join(', ')}</span> : null}
                  </div>
                ))}
              </div>
              <Field label="Campanha para todos os importados (opcional)">
                <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className={inputCls} placeholder="Ex: Lista fria — Jul/2026" />
              </Field>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-white/10">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10">Cancelar</button>
          <button onClick={submit} disabled={!rows || importing} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar {rows ? `(${rows.length})` : ''}
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

// ─── CSV helpers ───────────────────────────────────────

/** Gera e baixa um CSV modelo. */
function downloadTemplate() {
  const csv =
    'name,phone,email,campaign,tags\n' +
    'João Silva,5511999999999,joao@exemplo.com,Black Friday 2026,cliente;vip\n' +
    'Maria Souza,5511888888888,maria@exemplo.com,,lead\n';
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-contatos.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** Parser CSV robusto (aspas + delimitador , ou ;). Mapeia colunas por header. */
function parseContactsCsv(text: string): ImportContactRow[] {
  const clean = text.replace(/^﻿/, '');
  // Detecta o delimitador de coluna pela 1ª linha; tags usam o OUTRO separador.
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const tagSep = delim === ',' ? ';' : ',';

  const grid = tokenize(clean, delim);
  if (grid.length < 2) return [];

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = idx(['name', 'nome']);
  const iPhone = idx(['phone', 'telefone', 'celular', 'whatsapp']);
  const iEmail = idx(['email', 'e-mail']);
  const iCampaign = idx(['campaign', 'campanha']);
  const iTags = idx(['tags', 'tag', 'etiquetas']);

  const rows: ImportContactRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cols = grid[r];
    const get = (i: number) => (i >= 0 ? (cols[i] ?? '').trim() : '');
    const name = get(iName), phone = get(iPhone), email = get(iEmail), campaign = get(iCampaign);
    const tags = get(iTags).split(tagSep).map((t) => t.trim()).filter(Boolean);
    if (!name && !phone && !email) continue;
    rows.push({ ...(name ? { name } : {}), ...(phone ? { phone } : {}), ...(email ? { email } : {}), ...(campaign ? { campaign } : {}), ...(tags.length ? { tags } : {}) });
  }
  return rows;
}

/** Tokeniza o CSV em grade linha×coluna respeitando aspas. */
function tokenize(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}
