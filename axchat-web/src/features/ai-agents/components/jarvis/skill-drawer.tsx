'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Check, Plus, Trash2, Loader2, Table2, Database, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  aiCatalogService,
  type AiSkill,
  type AiTool,
} from '../../services/ai-catalog.service';

interface Props {
  open: boolean;
  skill: AiSkill | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500';

export function SkillDrawer({ open, skill, onClose, onSaved }: Props) {
  // common
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [promptInstructions, setPromptInstructions] = useState('');
  const [toolId, setToolId] = useState<string>('');
  const [timeoutMs, setTimeoutMs] = useState(15000);
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);

  // HTTP
  const [httpMethod, setHttpMethod] = useState('POST');
  const [httpPath, setHttpPath] = useState('');
  const [headersExtraJson, setHeadersExtraJson] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('{"email": "{{input.email}}"}');
  const [responseMap, setResponseMap] = useState('');

  // SQL (modo simplificado)
  const [sqlTables, setSqlTables] = useState<string[]>([]);
  const [newTableName, setNewTableName] = useState('');
  const [sqlReadOnly, setSqlReadOnly] = useState(true);
  const [sqlMaxRows, setSqlMaxRows] = useState(50);
  const [discoveredTables, setDiscoveredTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [showTablePanel, setShowTablePanel] = useState(false);

  const { data: tools } = useQuery({
    queryKey: ['ai-tools'],
    queryFn: () => aiCatalogService.listTools(),
    enabled: open,
  });

  const selectedTool = useMemo(
    () => (tools ?? []).find((t) => t.id === toolId),
    [tools, toolId],
  );
  // Source da skill é determinado pelo source da tool (HTTP ↔ CUSTOM_HTTP)
  const skillSource: 'HTTP' | 'SQL' | null = !selectedTool
    ? null
    : selectedTool.source === 'CUSTOM_HTTP'
      ? 'HTTP'
      : 'SQL';

  useEffect(() => {
    if (skill) {
      setName(skill.name);
      setDescription(skill.description);
      setCategory(skill.category ?? '');
      setPromptInstructions(skill.promptInstructions ?? '');
      setToolId(skill.toolId ?? '');
      setTimeoutMs(skill.timeoutMs);
      setChangeNote('');
      setHttpMethod(skill.httpMethod ?? 'POST');
      setHttpPath(skill.httpPath ?? '');
      setHeadersExtraJson(
        skill.httpHeadersExtra ? JSON.stringify(skill.httpHeadersExtra, null, 2) : '',
      );
      setBodyTemplate(skill.httpBodyTemplate ?? '');
      setResponseMap(
        skill.responseMap ? JSON.stringify(skill.responseMap, null, 2) : '',
      );
      setSqlTables(Array.isArray(skill.sqlTables) ? [...skill.sqlTables] : []);
      setSqlReadOnly(skill.sqlReadOnly);
      setSqlMaxRows(skill.sqlMaxRows);
      setNewTableName('');
    } else {
      setName('');
      setDescription('');
      setCategory('');
      setPromptInstructions('');
      setToolId('');
      setTimeoutMs(15000);
      setChangeNote('');
      setHttpMethod('POST');
      setHttpPath('');
      setHeadersExtraJson('');
      setBodyTemplate('{"email": "{{input.email}}"}');
      setResponseMap('');
      setSqlTables([]);
      setSqlReadOnly(true);
      setSqlMaxRows(50);
      setNewTableName('');
      setDiscoveredTables([]);
      setShowTablePanel(false);
    }
  }, [skill, open]);

  // Quando troca a tool pra SQL, mostra o painel de tabelas automaticamente
  useEffect(() => {
    if (skillSource === 'SQL') {
      setShowTablePanel(true);
    } else {
      setShowTablePanel(false);
    }
  }, [skillSource, toolId]);

  if (!open) return null;

  const fetchTables = async () => {
    if (!toolId) return;
    setLoadingTables(true);
    try {
      const res = await api.get(`/ai-catalog/tools/${toolId}/tables`);
      // NestJS wrap → precisa desempacotar
      const body: { tables?: string[] } = res.data.data ?? res.data;
      const tables = body.tables ?? [];
      setDiscoveredTables(tables);
      // Pré-marca as que já estavam selecionadas
      if (tables.length > 0 && sqlTables.length === 0) {
        setSqlTables([...tables]);
      }
      toast.success(`${tables.length} tabelas encontradas`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao buscar tabelas');
    } finally {
      setLoadingTables(false);
    }
  };

  const toggleDiscoveredTable = (tableName: string) => {
    setSqlTables((prev) =>
      prev.includes(tableName)
        ? prev.filter((t) => t !== tableName)
        : [...prev, tableName],
    );
  };

  const selectAllDiscovered = () => {
    setSqlTables([...new Set([...sqlTables, ...discoveredTables])]);
  };

  const deselectAllDiscovered = () => {
    setSqlTables(sqlTables.filter((t) => !discoveredTables.includes(t)));
  };

  const addTable = () => {
    const t = newTableName.trim();
    if (!t) return;
    if (sqlTables.includes(t)) {
      toast.error('Essa tabela já foi adicionada');
      return;
    }
    setSqlTables([...sqlTables, t]);
    setNewTableName('');
  };

  const removeTable = (name: string) =>
    setSqlTables(sqlTables.filter((t) => t !== name));

  const handleSave = async () => {
    if (!skillSource) {
      toast.error('Selecione uma tool');
      return;
    }

    const payload: any = {
      name,
      description,
      category: category.trim() || undefined,
      promptInstructions: promptInstructions.trim() || undefined,
      source: skillSource,
      toolId,
      timeoutMs,
      isActive: true,
      changeNote: changeNote.trim() || undefined,
    };

    if (skillSource === 'HTTP') {
      let parsedHeadersExtra: Record<string, string> | undefined;
      let parsedResponseMap: Record<string, string> | undefined;
      if (headersExtraJson.trim()) {
        try { parsedHeadersExtra = JSON.parse(headersExtraJson); }
        catch { toast.error('Headers extra: JSON inválido'); return; }
      }
      if (responseMap.trim()) {
        try { parsedResponseMap = JSON.parse(responseMap); }
        catch { toast.error('Response map: JSON inválido'); return; }
      }
      Object.assign(payload, {
        httpMethod,
        httpPath,
        httpHeadersExtra: parsedHeadersExtra,
        httpBodyTemplate: bodyTemplate || undefined,
        responseMap: parsedResponseMap,
      });
    } else {
      // Modo simplificado: só envia as tabelas. Backend auto-gera parameters.
      Object.assign(payload, {
        sqlTables: sqlTables.length > 0 ? sqlTables : undefined,
        sqlReadOnly,
        sqlMaxRows,
      });
    }

    setSaving(true);
    try {
      if (skill) {
        await aiCatalogService.updateSkill(skill.id, payload);
        toast.success(`Skill atualizada (v${skill.currentVersion + 1})`);
      } else {
        await aiCatalogService.createSkill(payload);
        toast.success('Skill criada');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        {/* ─── Header ─── */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {skill ? `Editar skill (v${skill.currentVersion} → v${skill.currentVersion + 1})` : 'Nova skill'}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              Skill = a função que o LLM chama. Bind a uma Tool.
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
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Nome
                  <span className="ml-1 text-zinc-400">— só letras/dígitos/underscore</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="consultarCliente"
                  className={inputCls + ' font-mono'}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Categoria</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="vendas / suporte"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Descrição (pra LLM)
                <span className="ml-1 text-zinc-400">— o LLM lê pra decidir quando chamar</span>
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Consulta dados de cliente (nome, email, pedidos) no banco de vendas."
                className={inputCls + ' resize-none'}
              />
            </div>
          </div>

          {/* ── Card: Tool ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tool (conexão)</h3>
            <div className="mt-3">
              <select
                value={toolId}
                onChange={(e) => setToolId(e.target.value)}
                className={inputCls}
              >
                <option value="">— selecione uma tool —</option>
                {(tools ?? []).map((t: AiTool) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.source === 'CUSTOM_HTTP' ? 'HTTP' : 'SQL'})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-zinc-500">
                {skillSource === 'SQL'
                  ? 'Tool do tipo SQL — o agente vai consultar o banco automaticamente.'
                  : skillSource === 'HTTP'
                    ? 'Tool do tipo HTTP — configure a chamada abaixo.'
                    : 'Selecione uma tool para continuar.'}
              </p>
            </div>
          </div>

          {/* ── Card: Configuração HTTP ── */}
          {skillSource === 'HTTP' && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Chamada HTTP</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr]">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Method</label>
                  <select
                    value={httpMethod}
                    onChange={(e) => setHttpMethod(e.target.value)}
                    className={inputCls}
                  >
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Path
                    <span className="ml-1 text-zinc-400">
                      {selectedTool?.httpBaseUrl ? `→ ${selectedTool.httpBaseUrl}` : ''}
                    </span>
                  </label>
                  <input
                    value={httpPath}
                    onChange={(e) => setHttpPath(e.target.value)}
                    placeholder="/admin/actions/reset-password"
                    className={inputCls + ' font-mono text-xs'}
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Headers extras (JSON)
                  <span className="ml-1 text-zinc-400">— opcional. Além dos headers da tool.</span>
                </label>
                <textarea
                  rows={2}
                  value={headersExtraJson}
                  onChange={(e) => setHeadersExtraJson(e.target.value)}
                  className={inputCls + ' font-mono text-xs'}
                />
              </div>

              {httpMethod !== 'GET' && httpMethod !== 'DELETE' && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Body template
                    <span className="ml-1 text-zinc-400">— {'{{input.x}}'}, {'{{ctx.x}}'}, {'{{env.X}}'}</span>
                  </label>
                  <textarea
                    rows={4}
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    className={inputCls + ' font-mono text-xs'}
                  />
                </div>
              )}

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Response mapping (JSON)
                  <span className="ml-1 text-zinc-400">— opcional. Ex: {'{"ok": "$.success"}'}</span>
                </label>
                <textarea
                  rows={2}
                  value={responseMap}
                  onChange={(e) => setResponseMap(e.target.value)}
                  className={inputCls + ' font-mono text-xs'}
                />
              </div>
            </div>
          )}

          {/* ── Card: Configuração SQL simplificada ── */}
          {skillSource === 'SQL' && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tabelas do banco</h3>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Adicione as tabelas que o agente pode consultar.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Botão puxar tabelas */}
                  <button
                    type="button"
                    onClick={fetchTables}
                    disabled={loadingTables || !toolId}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-black dark:text-zinc-300"
                  >
                    {loadingTables ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Database className="h-3.5 w-3.5" />
                    )}
                    {loadingTables ? 'Puxando…' : 'Puxar tabelas do banco'}
                  </button>
                  {/* Botão ocultar/mostrar painel */}
                  {discoveredTables.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTablePanel(!showTablePanel)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
                      title={showTablePanel ? 'Ocultar tabelas' : 'Mostrar tabelas'}
                    >
                      {showTablePanel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Painel de tabelas descobertas (colapsável) */}
              {showTablePanel && discoveredTables.length > 0 && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-black/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                      Tabelas encontradas ({discoveredTables.length})
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={selectAllDiscovered}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Marcar todas
                      </button>
                      <span className="text-[10px] text-zinc-300">|</span>
                      <button
                        type="button"
                        onClick={deselectAllDiscovered}
                        className="text-[10px] text-zinc-500 hover:underline"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {discoveredTables.map((tableName) => {
                      const checked = sqlTables.includes(tableName);
                      return (
                        <label
                          key={tableName}
                          className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-white/5 ${
                            checked ? 'bg-white dark:bg-black' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDiscoveredTable(tableName)}
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
                          />
                          <Database className="h-3 w-3 text-primary" />
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">
                            {tableName}
                          </span>
                          {checked && (
                            <span className="ml-auto text-[10px] text-primary">✓ ativa</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Input manual pra adicionar tabela */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTable()}
                  placeholder="Ou digite manualmente (ex: clientes)"
                  className={inputCls + ' flex-1 font-mono text-xs'}
                />
                <button
                  type="button"
                  onClick={addTable}
                  disabled={!newTableName.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </button>
              </div>

              {/* Lista de tabelas selecionadas */}
              {sqlTables.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {sqlTables.map((t) => (
                    <div
                      key={t}
                      className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-black"
                    >
                      <div className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-mono text-zinc-800 dark:text-zinc-200">{t}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTable(t)}
                        className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center dark:border-white/15 dark:bg-white/5">
                  <Table2 className="mx-auto h-6 w-6 text-zinc-300 dark:text-zinc-600" />
                  <p className="mt-1 text-xs text-zinc-400">
                    Nenhuma tabela ainda. Use "Puxar tabelas do banco" ou digite manualmente.
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-4 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Máx. linhas
                  </label>
                  <input
                    type="number"
                    value={sqlMaxRows}
                    onChange={(e) => setSqlMaxRows(parseInt(e.target.value, 10) || 50)}
                    className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/15 dark:bg-black dark:text-zinc-100"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={sqlReadOnly}
                    onChange={(e) => setSqlReadOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
                  />
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Read-only (recomendado)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ── Card: Instruções extras ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Instruções extras</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Opcional. Dicas pro agente sobre quando usar essa skill.
            </p>
            <textarea
              rows={3}
              value={promptInstructions}
              onChange={(e) => setPromptInstructions(e.target.value)}
              placeholder="Ex: Consulte essa skill sempre que o cliente perguntar sobre dados pessoais."
              className={inputCls + ' mt-3 font-mono text-xs'}
            />
          </div>

          {/* ── Card: Timeout & Change note ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Configurações</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Timeout (ms)</label>
                <input
                  type="number"
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(parseInt(e.target.value, 10) || 15000)}
                  className={inputCls}
                />
              </div>
              {skill && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Nota da mudança
                    <span className="ml-1 text-zinc-400">— vai pro changelog</span>
                  </label>
                  <input
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    placeholder="Ajustei a consulta..."
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !description || !toolId}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Salvando…' : (
              <>
                <Check className="h-4 w-4" />
                {skill ? 'Salvar nova versão' : 'Criar skill'}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
