'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { InstagramIcon } from '@/components/ui/icons';
import { channelsService, type CoexistenceConfig } from '../services/channels.service';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';
const FB_SDK_ID = 'facebook-jssdk';

interface InstagramConnectProps {
  name: string;
  onConnect: (data: { code: string }) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * Conexão do Instagram via Facebook Login for Business. O dono clica em
 * "Conectar com o Facebook", faz login e escolhe a Página/conta IG no popup da
 * Meta; nós capturamos só o `code` e o backend descobre a Página + a conta
 * profissional do Instagram e monta o canal — o dono não digita token nenhum.
 *
 * appId/instagramConfigId vêm do PlatformSetting (Super Admin > Integrações) —
 * credenciais do nosso app Meta, válidas pra plataforma toda.
 */
export function InstagramConnect({ name, onConnect, isSubmitting }: InstagramConnectProps) {
  const [config, setConfig] = useState<CoexistenceConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    channelsService
      .getCoexistenceConfig()
      .then((cfg) => {
        if (active) setConfig(cfg);
      })
      .catch(() => {
        if (active) setConfig({ appId: '', configId: '', enabled: false });
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const enabled = !!config?.instagramEnabled;
  const configId = config?.instagramConfigId;
  // App do Instagram (dedicado ou herdado do WhatsApp).
  const igAppId = config?.instagramAppId || config?.appId;

  // Carrega o SDK do Facebook uma única vez (após ter o appId).
  useEffect(() => {
    if (!enabled || !igAppId) return;

    if (window.FB) {
      setSdkReady(true);
      return;
    }

    window.fbAsyncInit = () => {
      window.FB.init({
        appId: igAppId,
        autoLogAppEvents: true,
        xfbml: false,
        version: 'v25.0',
      });
      setSdkReady(true);
    };

    if (!document.getElementById(FB_SDK_ID)) {
      const script = document.createElement('script');
      script.id = FB_SDK_ID;
      script.src = FB_SDK_SRC;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
    }
  }, [enabled, igAppId]);

  const launch = useCallback(() => {
    if (!window.FB || !configId) return;
    setError(null);
    setLaunching(true);

    // O SDK do Facebook rejeita callbacks `async` — mantemos síncrono e
    // disparamos o trabalho assíncrono por dentro.
    window.FB.login(
      (response: any) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setError('Não foi possível obter o código de autorização da Meta.');
          setLaunching(false);
          return;
        }
        void (async () => {
          try {
            await onConnect({ code });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao criar o canal.');
          } finally {
            setLaunching(false);
          }
        })();
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
      },
    );
  }, [onConnect, configId]);

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
          Login com Facebook indisponível: o app Meta da plataforma ainda não foi
          configurado pro Instagram. Peça ao <strong>Super Admin</strong> para
          preencher App ID, App Secret e <strong>Instagram Config ID</strong> em{' '}
          <strong>Integrações</strong>.
        </p>
      </div>
    );
  }

  const busy = launching || isSubmitting;
  const canLaunch = sdkReady && !busy && name.trim().length > 0;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-3 text-xs leading-relaxed text-pink-900 dark:border-pink-900/50 dark:bg-pink-950/30 dark:text-pink-100">
        <p className="font-medium">Conectar pelo Facebook (recomendado)</p>
        <ol className="mt-2 space-y-1.5">
          <li>1. Clique em <strong>Conectar com o Facebook</strong> abaixo.</li>
          <li>2. Faça login com a conta que administra a Página do Facebook.</li>
          <li>
            3. Na janela da Meta, <strong>selecione a Página</strong> vinculada à
            conta profissional do Instagram e conceda as permissões.
          </li>
          <li>
            4. Pronto. Puxamos o token, a Página e a conta do Instagram
            automaticamente — você não digita nada.
          </li>
        </ol>
        <p className="mt-2 text-[11px] text-pink-700 dark:text-pink-300">
          A conta do Instagram precisa ser <strong>Profissional</strong>{' '}
          (Business/Creator) e estar <strong>vinculada a uma Página</strong> do
          Facebook.
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
        onClick={launch}
        disabled={!canLaunch}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <InstagramIcon className="h-4 w-4" />
        )}
        {launching
          ? 'Aguardando conexão...'
          : isSubmitting
            ? 'Criando canal...'
            : 'Conectar com o Facebook'}
      </button>

      {!sdkReady && (
        <p className="text-center text-[11px] text-zinc-400">
          Carregando SDK da Meta...
        </p>
      )}
    </div>
  );
}
