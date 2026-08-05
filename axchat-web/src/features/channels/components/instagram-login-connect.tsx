'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { InstagramIcon } from '@/components/ui/icons';
import {
  channelsService,
  type CoexistenceConfig,
  type ChannelVisibility,
} from '../services/channels.service';

interface InstagramLoginConnectProps {
  name: string;
  visibility?: ChannelVisibility;
}

/**
 * Conexão do Instagram via **Login do Instagram** — o dono entra com a conta do
 * próprio Instagram, sem precisar de Página do Facebook. Clicar redireciona o
 * navegador pra tela de autorização da Meta; ao voltar, o callback do backend
 * cria o canal e devolve pra cá com ?instagram=connected.
 *
 * As credenciais (App ID + Secret do produto "Instagram") são configuradas pelo
 * Super Admin em Integrações — é o que liga o `instagramLoginEnabled`.
 */
export function InstagramLoginConnect({ name, visibility }: InstagramLoginConnectProps) {
  const [config, setConfig] = useState<CoexistenceConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    channelsService
      .getCoexistenceConfig()
      .then((cfg) => active && setConfig(cfg))
      .catch(() => active && setConfig({ appId: '', configId: '', enabled: false }))
      .finally(() => active && setLoadingConfig(false));
    return () => {
      active = false;
    };
  }, []);

  const enabled = !!config?.instagramLoginEnabled;

  const connect = async () => {
    if (!name.trim()) return;
    setError(null);
    setRedirecting(true);
    try {
      const { url } = await channelsService.getInstagramLoginAuthUrl({
        name: name.trim(),
        visibility,
      });
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao iniciar a conexão com o Instagram',
      );
      setRedirecting(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="mt-6 flex items-center justify-center gap-2 py-6 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando configuração...
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Login do Instagram indisponível: o app ainda não foi configurado. Peça
          ao <strong>Super Admin</strong> para preencher{' '}
          <strong>Instagram Login App ID</strong> e{' '}
          <strong>Instagram Login App Secret</strong> em{' '}
          <strong>Integrações</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-3 text-xs leading-relaxed text-pink-900 dark:border-pink-900/50 dark:bg-pink-950/30 dark:text-pink-100">
        <p className="font-medium">Entrar com a conta do Instagram</p>
        <ol className="mt-2 space-y-1.5">
          <li>1. Clique em <strong>Conectar com o Instagram</strong> abaixo.</li>
          <li>2. Você é levado pro Instagram pra entrar e autorizar o acesso.</li>
          <li>3. Ao confirmar, voltamos e o canal é criado automaticamente.</li>
        </ol>
        <p className="mt-2 text-[11px] text-pink-700 dark:text-pink-300">
          Esta opção <strong>não exige Página do Facebook</strong> — o cliente
          entra direto com a conta do Instagram (Profissional: Business ou
          Creator). Use a aba <strong>&quot;Login Facebook&quot;</strong> se a
          conta já estiver vinculada a uma Página.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={connect}
        disabled={redirecting || name.trim().length === 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {redirecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <InstagramIcon className="h-4 w-4" />
        )}
        {redirecting ? 'Redirecionando...' : 'Conectar com o Instagram'}
      </button>
    </div>
  );
}
