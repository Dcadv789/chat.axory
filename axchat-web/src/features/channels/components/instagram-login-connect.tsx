'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
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
 * Business Login for Instagram — conecta a conta do Instagram DIRETO (popup do
 * próprio Instagram), sem depender de Página do Facebook nem de Business
 * Portfolio. É o caminho pra contas em portfólio empresarial separado. Clicar
 * redireciona o navegador pra Meta; ao voltar, o callback do backend cria o
 * canal e devolve pra cá com ?instagram=connected.
 */
export function InstagramLoginConnect({ name, visibility }: InstagramLoginConnectProps) {
  const [config, setConfig] = useState<CoexistenceConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

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
    setRedirecting(true);
    try {
      const { url } = await channelsService.getInstagramLoginUrl(name.trim(), visibility);
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar conexão com o Instagram');
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
          Login com Instagram indisponível: o app do Instagram ainda não foi
          configurado. Peça ao <strong>Super Admin</strong> para preencher o{' '}
          <strong>Instagram App ID</strong> e <strong>App Secret</strong> (do
          produto Instagram) em <strong>Integrações</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-3 text-xs leading-relaxed text-pink-900 dark:border-pink-900/50 dark:bg-pink-950/30 dark:text-pink-100">
        <p className="font-medium">Conectar direto pelo Instagram (recomendado)</p>
        <ol className="mt-2 space-y-1.5">
          <li>1. Clique em <strong>Conectar com o Instagram</strong> abaixo.</li>
          <li>2. Faça login na conta do Instagram e autorize o acesso.</li>
          <li>3. Pronto — puxamos a conta e o token automaticamente.</li>
        </ol>
        <p className="mt-2 text-[11px] text-pink-700 dark:text-pink-300">
          Não precisa de Página do Facebook nem de Portfólio Empresarial. A conta
          só precisa ser <strong>Profissional</strong> (Business/Creator).
        </p>
      </div>

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
