'use client';

import { useEffect, useState } from 'react';
import { X, Globe, Database, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  type AiTool,
  type ToolSource,
} from '../../services/ai-catalog.service';

interface Props {
  open: boolean;
  tool: AiTool | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500';

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export function ToolDrawer({ open, tool, onClose, onSaved }: Props) {
  const [source, setSource] = useState<ToolSource>('CUSTOM_HTTP');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [httpBaseUrl, setHttpBaseUrl] = useState('');
  const [headersJson, setHeadersJson] = useState('{}');
  const [sqlConnectionRef, setSqlConnectionRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (tool) {
      setSource(tool.source);
      setName(tool.name);
      setDescription(tool.description);
      setHttpBaseUrl(tool.httpBaseUrl ?? '');
      setHeadersJson(JSON.stringify(tool.httpHeaders ?? {}, null, 2));
      setSqlConnectionRef(tool.sqlConnectionRef ?? '');
    } else {
      setSource('CUSTOM_HTTP');
      setName('');
      setDescription('');
      setHttpBaseUrl('');
      setHeadersJson('{}');
      setSqlConnectionRef('');
    }
    setTestResult(null);
  }, [tool, open]);

  if (!open) return null;

  const handleSave = async () => {
    const payload: any = {
      name,
      description,
      source,
      isActive: true,
    };

    if (source === 'CUSTOM_HTTP') {
      let parsedHeaders: Record<string, string>;
      try {
        parsedHeaders = headersJson.trim() ? JSON.parse(headersJson) : {};
      } catch {
        toast.error('Headers: JSON inválido');
        return;
      }
      payload.httpBaseUrl = httpBaseUrl;
      payload.httpHeaders = parsedHeaders;
    } else {
      payload.sqlConnectionRef = sqlConnectionRef;
    }

    setSaving(true);
    try {
      if (tool) {
        await api.patch(`/ai-catalog/tools/${tool.id}`, payload);
        toast.success('Tool atualizada');
      } else {
        await api.post('/ai-catalog/tools', payload);
        toast.success('Tool criada');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);

    const body: any = { source };

    if (source === 'CUSTOM_SQL') {
      if (!sqlConnectionRef.trim()) {
        toast.error('Preencha o nome da variável primeiro');
        setTesting(false);
        return;
      }
      body.sqlConnectionRef = sqlConnectionRef.trim();
    } else {
      if (!httpBaseUrl.trim()) {
        toast.error('Preencha a Base URL primeiro');
        setTesting(false);
        return;
      }
      body.httpBaseUrl = httpBaseUrl.trim();
      try {
        body.httpHeaders = headersJson.trim() ? JSON.parse(headersJson) : {};
      } catch {
        toast.error('Headers: JSON inválido');
        setTesting(false);
        return;
      }
    }

    try {
      const { data: raw } = await api.post('/ai-catalog/tools/test-connection', body);
      // NestJS wrap → precisa desempacotar
      const result: TestResult = raw.data ?? raw;
      setTestResult(result);
      if (result.ok) {
        toast.success(`Conectado! (${result.latencyMs}ms)`);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Erro ao testar conexão';
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
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
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        {/* ─── Header ─── */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {tool ? 'Editar tool' : 'Nova tool (conexão)'}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              Conexão reusável entre várias skills
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
          {/* ── Tipo de tool ── */}
          {!tool && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tipo de conexão</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setSource('CUSTOM_HTTP'); setTestResult(null); }}
                  className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors ${
                    source === 'CUSTOM_HTTP'
                      ? 'border-primary bg-primary/5'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10'
                  }`}
                >
                  <Globe className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">HTTP API</p>
                    <p className="text-[11px] text-zinc-500">REST com auth</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setSource('CUSTOM_SQL'); setTestResult(null); }}
                  className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors ${
                    source === 'CUSTOM_SQL'
                      ? 'border-primary bg-primary/5'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10'
                  }`}
                >
                  <Database className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">SQL Postgres</p>
                    <p className="text-[11px] text-zinc-500">Query num banco</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── Card: Dados básicos ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dados básicos</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Nome</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={source === 'CUSTOM_SQL' ? 'Supabase produção' : 'Trivapp'}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Descrição</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    source === 'CUSTOM_SQL'
                      ? 'Banco PostgreSQL do Supabase. Read-only.'
                      : 'Plataforma da área de membros. Server-to-server admin endpoints.'
                  }
                  className={inputCls + ' resize-none'}
                />
              </div>
            </div>
          </div>

          {/* ── Card: Configuração ── */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            {source === 'CUSTOM_HTTP' ? (
              <>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">HTTP API</h3>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      Base URL
                      <span className="ml-1 text-zinc-400">— URL base da API</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        value={httpBaseUrl}
                        onChange={(e) => setHttpBaseUrl(e.target.value)}
                        placeholder="https://api.trivapp.com.br/api/v1"
                        className={inputCls + ' flex-1 font-mono text-xs'}
                      />
                      <button
                        type="button"
                        onClick={testConnection}
                        disabled={testing || !httpBaseUrl.trim()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-black dark:text-zinc-300"
                      >
                        {testing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Globe className="h-3.5 w-3.5" />
                        )}
                        Testar
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      Headers padrão (JSON)
                      <span className="ml-1 text-zinc-400">— Auth que vai em TODAS as skills. Templates: {'{{env.X}}'}</span>
                    </label>
                    <textarea
                      rows={5}
                      value={headersJson}
                      onChange={(e) => setHeadersJson(e.target.value)}
                      placeholder='{"x-admin-api-key":"{{env.MEMBERS_ADMIN_KEY}}","Content-Type":"application/json"}'
                      className={inputCls + ' font-mono text-xs'}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">SQL Postgres</h3>
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
                    <p className="font-medium">⚠️ Atenção — são DUAS etapas:</p>
                    <ol className="mt-1 list-decimal pl-4 space-y-1">
                      <li>
                        <strong>Já fui em Configurações → Variáveis</strong> e cadastrei a chave{' '}
                        <code className="font-mono">{sqlConnectionRef || 'SUPABASE_DB_URL'}</code>{' '}
                        com o valor da connection string do banco.
                      </li>
                      <li>
                        <strong>Agora aqui na Tool</strong> vou colocar o MESMO nome da chave no campo abaixo.
                      </li>
                    </ol>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      Nome da variável
                      <span className="ml-1 font-normal text-zinc-400">
                        — exatamente igual ao que você usou em Configurações → Variáveis
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        value={sqlConnectionRef}
                        onChange={(e) => setSqlConnectionRef(e.target.value)}
                        placeholder="SUPABASE_DB_URL"
                        className={inputCls + ' flex-1 font-mono'}
                      />
                      <button
                        type="button"
                        onClick={testConnection}
                        disabled={testing || !sqlConnectionRef.trim()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-black dark:text-zinc-300"
                      >
                        {testing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Database className="h-3.5 w-3.5" />
                        )}
                        Testar
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Resultado do teste ── */}
            {testResult && (
              <div
                className={`mt-4 flex items-start gap-2 rounded-md border p-3 text-xs ${
                  testResult.ok
                    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/10 dark:text-green-300'
                    : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                )}
                <div>
                  <p className="font-medium">
                    {testResult.ok ? 'Conectado' : 'Falha na conexão'}
                  </p>
                  <p className="mt-0.5 opacity-80">{testResult.message}</p>
                  {testResult.latencyMs && (
                    <p className="mt-0.5 opacity-60">{testResult.latencyMs}ms de latência</p>
                  )}
                </div>
              </div>
            )}
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
            disabled={saving || !name || !description}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Salvando…' : tool ? 'Salvar alterações' : 'Criar tool'}
          </button>
        </div>
      </div>
    </>
  );
}
