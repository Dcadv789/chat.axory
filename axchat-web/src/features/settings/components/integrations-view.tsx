'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Check,
  Copy,
  Instagram,
  MapPin,
  Loader2,
  Eye,
  EyeOff,
  CircleCheck,
  CircleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  secretsService,
  type OrganizationSecret,
} from '@/features/ai-agents/services/secrets.service';

// Base pública da API — em produção vira https://api-chat.axory.com.br/api/v1.
// O callback do Meta tem que apontar pra cá (não pro front).
const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

interface Endpoint {
  method: string;
  path: string;
  label: string;
}

interface Integration {
  id: string;
  name: string;
  icon: React.ElementType;
  accent: string; // tailwind text color
  description: string;
  apiBase: string;
  secretKey: string;
  secretHint: string;
  webhookUrl?: string; // só Meta/Instagram tem inbound webhook
  endpoints: Endpoint[];
  setupUrl: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'instagram',
    name: 'Instagram / Meta',
    icon: Instagram,
    accent: 'text-pink-600 dark:text-pink-400',
    description:
      'Publicar posts, ler insights de mídia e responder comentários via Graph API. O webhook recebe DMs e eventos em tempo real.',
    apiBase: 'https://graph.facebook.com/v21.0',
    secretKey: 'IG_ACCESS_TOKEN',
    secretHint:
      'Token de acesso de longa duração da conta business (Graph API). Gere no Meta for Developers > seu app > Instagram > tokens.',
    webhookUrl: `${API_BASE}/webhooks/INSTAGRAM`,
    endpoints: [
      { method: 'GET', path: '/{ig-media-id}/insights', label: 'Métricas/insights de uma mídia' },
      { method: 'POST', path: '/{ig-user-id}/media', label: 'Cria container do post (passo 1)' },
      { method: 'POST', path: '/{ig-user-id}/media_publish', label: 'Publica o container (passo 2)' },
      { method: 'POST', path: '/{ig-comment-id}/replies', label: 'Responde a um comentário' },
    ],
    setupUrl: 'https://developers.facebook.com/apps',
  },
  {
    id: 'google-business',
    name: 'Google Business',
    icon: MapPin,
    accent: 'text-blue-600 dark:text-blue-400',
    description:
      'Publicar posts e gerenciar avaliações (reviews) do perfil do Google Business. Sem webhook — as skills consultam a API sob demanda.',
    apiBase: 'https://mybusiness.googleapis.com/v4',
    secretKey: 'GBP_ACCESS_TOKEN',
    secretHint:
      'Access token OAuth com escopo do Business Profile. Gere no Google Cloud Console > credenciais OAuth.',
    endpoints: [
      { method: 'POST', path: '/accounts/{account}/locations/{location}/localPosts', label: 'Cria um post' },
      { method: 'GET', path: '/accounts/{account}/locations/{location}/reviews', label: 'Lista avaliações' },
      { method: 'PUT', path: '/accounts/{account}/locations/{location}/reviews/{review}/reply', label: 'Responde uma avaliação' },
    ],
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
  },
];

export function IntegrationsView() {
  const [secrets, setSecrets] = useState<OrganizationSecret[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSecrets(await secretsService.list());
    } catch {
      toast.error('Erro ao carregar credenciais');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const configuredKeys = new Set(secrets.map((s) => s.key));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Integrações de Marketing
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Conecte Instagram/Meta e Google Business para os agentes de marketing
          publicarem, responderem e lerem métricas. Configure a credencial de
          cada plataforma e registre o webhook onde indicado.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : (
        INTEGRATIONS.map((it) => (
          <IntegrationCard
            key={it.id}
            integration={it}
            configured={configuredKeys.has(it.secretKey)}
            onSaved={load}
          />
        ))
      )}
    </div>
  );
}

function IntegrationCard({
  integration,
  configured,
  onSaved,
}: {
  integration: Integration;
  configured: boolean;
  onSaved: () => void;
}) {
  const Icon = integration.icon;
  const [tokenValue, setTokenValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!tokenValue.trim()) {
      toast.error('Informe o valor da credencial');
      return;
    }
    setSaving(true);
    try {
      await secretsService.upsert({
        key: integration.secretKey,
        value: tokenValue.trim(),
      });
      toast.success(`${integration.secretKey} salvo`);
      setTokenValue('');
      setShowValue(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao salvar credencial');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-white/5 ${integration.accent}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {integration.name}
            </h3>
            <p className="text-xs text-zinc-500">{integration.apiBase}</p>
          </div>
        </div>
        {configured ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
            <CircleCheck className="h-3.5 w-3.5" />
            Credencial ativa
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            <CircleAlert className="h-3.5 w-3.5" />
            Falta credencial
          </span>
        )}
      </div>

      <div className="space-y-5 p-5">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {integration.description}
        </p>

        {/* Webhook (só Meta) */}
        {integration.webhookUrl && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Webhook (callback URL)
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Registre esta URL no painel do Meta como callback de webhook. O
              verify token deve ser igual ao definido ao criar o canal Instagram.
            </p>
            <CopyableField value={integration.webhookUrl} />
          </div>
        )}

        {/* Endpoints */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Endpoints usados pelas skills ({integration.endpoints.length})
          </p>
          <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-white/10">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {integration.endpoints.map((ep) => (
                  <tr key={ep.path}>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${methodColor(ep.method)}`}
                      >
                        {ep.method}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {ep.path}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-zinc-500">
                      {ep.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Credencial */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Credencial · <span className="font-mono normal-case">{integration.secretKey}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">{integration.secretHint}</p>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <input
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                type={showValue ? 'text' : 'password'}
                placeholder={configured ? 'Substituir valor atual…' : 'Cole o token aqui'}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-9 font-mono text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
              />
              {tokenValue && (
                <button
                  type="button"
                  onClick={() => setShowValue((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {configured ? 'Atualizar' : 'Salvar'}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Salvo como variável de ambiente da organização. As skills consomem
            via <span className="font-mono">{`{{env.${integration.secretKey}}}`}</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

function CopyableField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
        {value}
      </code>
      <button
        onClick={copy}
        className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-300"
        title="Copiar"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function methodColor(method: string): string {
  switch (method) {
    case 'GET':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'POST':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'PUT':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-300';
  }
}
