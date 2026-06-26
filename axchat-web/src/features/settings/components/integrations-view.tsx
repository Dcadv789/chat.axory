'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Check,
  Copy,
  Instagram,
  MapPin,
  Sparkles,
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

// Cada credencial/ID que a org precisa preencher uma vez.
interface Field {
  key: string;
  label: string;
  hint: string;
  secret: boolean; // token sensível (mascarado) vs ID público (texto)
  tutorial?: string; // passo a passo curto de como conseguir
}

interface Integration {
  id: string;
  name: string;
  icon: React.ElementType;
  accent: string;
  description: string;
  apiBase: string;
  fields: Field[];
  webhookUrl?: string;
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
      'Publicar posts, ler insights de mídia, responder comentários e gerir anúncios (Meta Ads). O webhook recebe DMs e eventos em tempo real.',
    apiBase: 'https://graph.facebook.com/v21.0',
    fields: [
      {
        key: 'IG_ACCESS_TOKEN',
        label: 'Token Instagram (Graph API)',
        hint: 'Token de longa duração da conta business.',
        secret: true,
        tutorial:
          '1) Acesse developers.facebook.com → seu App. 2) Adicione o produto "Instagram" e conecte a conta Business. 3) Em Ferramentas → Graph API Explorer, gere um token com as permissões instagram_basic, instagram_content_publish, instagram_manage_comments e pages_show_list. 4) Converta para token de LONGA duração (60 dias) em /oauth/access_token?grant_type=fb_exchange_token.',
      },
      {
        key: 'IG_USER_ID',
        label: 'IG User ID (ig-user-id)',
        hint: 'ID numérico da conta business do Instagram.',
        secret: false,
        tutorial:
          'No Graph API Explorer: GET /me/accounts → pegue o "id" da sua Página. Depois GET /{page-id}?fields=instagram_business_account → o "id" retornado é o seu IG User ID.',
      },
      {
        key: 'META_ADS_ACCESS_TOKEN',
        label: 'Token Meta Ads (Marketing API)',
        hint: 'Token com permissão ads_management/ads_read.',
        secret: true,
        tutorial:
          'Business Manager (business.facebook.com) → Configurações do Negócio → Usuários → Usuários do sistema → crie um e "Gerar novo token", marcando ads_management e ads_read. Esse token é de longa duração.',
      },
      {
        key: 'META_AD_ACCOUNT_ID',
        label: 'Ad Account ID',
        hint: 'ID numérico da conta de anúncios SEM o prefixo "act_".',
        secret: false,
        tutorial:
          'Gerenciador de Anúncios (adsmanager.facebook.com) → canto superior esquerdo aparece "Conta: act_XXXXXXXX". Cole apenas o número (sem o "act_").',
      },
      {
        key: 'FB_PAGE_ID',
        label: 'Facebook Page ID',
        hint: 'ID da Página do Facebook vinculada à conta (criativo do anúncio).',
        secret: false,
        tutorial:
          'Abra a Página no Facebook → menu "Sobre"/"Transparência da Página" → role até "ID da Página". Ou no Graph API Explorer: GET /me/accounts → o "id" da Página.',
      },
      {
        key: 'META_PIXEL_ID',
        label: 'Pixel ID (conversões)',
        hint: 'ID do Pixel/Dataset do Meta. Necessário para campanhas de conversão/venda (otimização por evento do Pixel).',
        secret: false,
        tutorial:
          'Gerenciador de Eventos (business.facebook.com/events_manager) → selecione sua Fonte de Dados (Pixel) → o número que aparece é o Pixel ID. Garanta que o Pixel está instalado no site e disparando os eventos (Purchase, Lead, etc).',
      },
    ],
    webhookUrl: `${API_BASE}/webhooks/INSTAGRAM`,
    endpoints: [
      { method: 'GET', path: '/{ig-media-id}/insights', label: 'Métricas/insights de uma mídia' },
      { method: 'POST', path: '/{ig-user-id}/media', label: 'Cria container do post (passo 1)' },
      { method: 'POST', path: '/{ig-user-id}/media_publish', label: 'Publica o container (passo 2)' },
      { method: 'GET', path: '/act_{ad-account}/insights', label: 'Insights da conta de anúncios' },
      { method: 'POST', path: '/act_{ad-account}/campaigns', label: 'Cria/lista campanhas' },
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
    fields: [
      {
        key: 'GBP_ACCESS_TOKEN',
        label: 'Access Token (OAuth)',
        hint: 'Token OAuth com escopo do Business Profile.',
        secret: true,
        tutorial:
          '1) Google Cloud Console → ative a "Business Profile API". 2) Crie credenciais OAuth 2.0. 3) Gere um access token com o escopo https://www.googleapis.com/auth/business.manage (pelo OAuth Playground ou seu fluxo de OAuth).',
      },
      {
        key: 'GBP_ACCOUNT_ID',
        label: 'Account ID',
        hint: 'Parte numérica de accounts/{id}.',
        secret: false,
        tutorial:
          'Chame GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts com o token → use o número em "accounts/{id}".',
      },
      {
        key: 'GBP_LOCATION_ID',
        label: 'Location ID',
        hint: 'Parte numérica de locations/{id}.',
        secret: false,
        tutorial:
          'Chame GET /v1/accounts/{accountId}/locations → use o número em "locations/{id}" da localização desejada.',
      },
    ],
    endpoints: [
      { method: 'POST', path: '/accounts/{account}/locations/{location}/localPosts', label: 'Cria um post' },
      { method: 'GET', path: '/accounts/{account}/locations/{location}/reviews', label: 'Lista avaliações' },
      { method: 'PUT', path: '/accounts/{account}/locations/{location}/reviews/{review}/reply', label: 'Responde uma avaliação' },
    ],
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    id: 'openai',
    name: 'OpenAI (imagem)',
    icon: Sparkles,
    accent: 'text-emerald-600 dark:text-emerald-400',
    description:
      'Geração de criativos (gpt-image-1) para a agente Orla. A imagem é gerada e hospedada automaticamente, devolvendo uma URL pública pronta pra publicar.',
    apiBase: 'https://api.openai.com/v1',
    fields: [
      {
        key: 'OPENAI_API_KEY',
        label: 'API Key',
        hint: 'Chave secreta da OpenAI (sk-...). Usada pela ferramenta generateMarketingImage.',
        secret: true,
        tutorial:
          'Acesse platform.openai.com/api-keys → "Create new secret key" → copie a chave (sk-...). Garanta que a conta tem créditos e acesso ao modelo de imagem.',
      },
    ],
    endpoints: [
      { method: 'POST', path: '/images/generations', label: 'Gera a arte (gpt-image-1)' },
    ],
    setupUrl: 'https://platform.openai.com/api-keys',
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
          Cada organização preenche suas credenciais e IDs aqui uma vez. Depois
          disso os agentes de marketing operam de forma autônoma — eles puxam
          tokens e IDs automaticamente, sem precisar perguntar a ninguém.
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
            configuredKeys={configuredKeys}
            onSaved={load}
          />
        ))
      )}
    </div>
  );
}

function IntegrationCard({
  integration,
  configuredKeys,
  onSaved,
}: {
  integration: Integration;
  configuredKeys: Set<string>;
  onSaved: () => void;
}) {
  const Icon = integration.icon;
  const total = integration.fields.length;
  const done = integration.fields.filter((f) => configuredKeys.has(f.key)).length;
  const allDone = done === total;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
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
        {allDone ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
            <CircleCheck className="h-3.5 w-3.5" />
            Tudo configurado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            <CircleAlert className="h-3.5 w-3.5" />
            {done}/{total} configuradas
          </span>
        )}
      </div>

      <div className="space-y-5 p-5">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {integration.description}
        </p>

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

        {/* Credenciais + IDs */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Credenciais e IDs ({done}/{total})
          </p>
          {integration.fields.map((field) => (
            <SecretField
              key={field.key}
              field={field}
              configured={configuredKeys.has(field.key)}
              onSaved={onSaved}
            />
          ))}
        </div>

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
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${methodColor(ep.method)}`}>
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
      </div>
    </div>
  );
}

function SecretField({
  field,
  configured,
  onSaved,
}: {
  field: Field;
  configured: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) {
      toast.error('Informe o valor');
      return;
    }
    setSaving(true);
    try {
      await secretsService.upsert({ key: field.key, value: value.trim() });
      toast.success(`${field.key} salvo`);
      setValue('');
      setShowValue(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {field.label} ·{' '}
          <span className="font-mono text-[11px] font-normal text-zinc-400">{field.key}</span>
        </p>
        {configured ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="h-3 w-3" /> ok
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <CircleAlert className="h-3 w-3" /> falta
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-500">{field.hint}</p>
      {field.tutorial && (
        <details className="mt-1 rounded-md bg-zinc-50 px-2.5 py-1.5 dark:bg-white/5">
          <summary className="cursor-pointer text-[11px] font-medium text-primary">
            Como obter
          </summary>
          <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {field.tutorial}
          </p>
        </details>
      )}
      <div className="mt-1.5 flex gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type={field.secret && !showValue ? 'password' : 'text'}
            placeholder={configured ? 'Substituir valor atual…' : `Cole ${field.secret ? 'o token' : 'o ID'} aqui`}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-9 font-mono text-sm outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
          {field.secret && value && (
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
