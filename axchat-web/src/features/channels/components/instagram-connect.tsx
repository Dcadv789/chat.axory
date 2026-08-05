'use client';

import { useState, useCallback } from 'react';
import { Loader2, AlertTriangle, Bug, Copy } from 'lucide-react';
import { InstagramIcon } from '@/components/ui/icons';
import { channelsService } from '../services/channels.service';
import { useInstagramLogin } from '../hooks/use-instagram-login';

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
  // O popup em si mora no hook — a tela de reconectar usa o mesmo. Duas cópias
  // do FB.login foi como o app do WhatsApp e o do Instagram se atropelaram.
  const { login, enabled, sdkReady, loadingConfig, igAppId, configId } =
    useInstagramLogin();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<string | null>(null);

  // `debug=true` → não cria canal; chama o endpoint de debug e mostra o JSON cru.
  const launch = useCallback(
    (debug = false) => {
      setError(null);
      setDebugData(null);
      setLaunching(true);

      void (async () => {
        try {
          const code = await login();
          if (debug) {
            const raw = await channelsService.debugInstagramFacebookLogin({ code });
            setDebugData(JSON.stringify(raw, null, 2));
          } else {
            await onConnect({ code });
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Falha ao processar.',
          );
          // Sem estes dados o dono via só uma mensagem genérica e não havia o
          // que mandar pro suporte.
          setDebugData(
            JSON.stringify(
              {
                erro: err instanceof Error ? err.message : String(err),
                appIdUsado: igAppId,
                configIdUsado: configId,
                origem: typeof window !== 'undefined' ? window.location.origin : null,
              },
              null,
              2,
            ),
          );
        } finally {
          setLaunching(false);
        }
      })();
    },
    [onConnect, login, igAppId, configId],
  );

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
        onClick={() => launch(false)}
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

      {/* Modo debug: mostra os dados brutos da Meta pra diagnosticar. */}
      <button
        type="button"
        onClick={() => launch(true)}
        disabled={!canLaunch}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
      >
        <Bug className="h-3.5 w-3.5" />
        Conectar em modo debug (mostrar dados brutos)
      </button>

      {debugData && (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50 dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-white/10">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Resposta bruta da Meta
            </span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(debugData)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/10"
            >
              <Copy className="h-3 w-3" /> Copiar
            </button>
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all p-3 text-[10px] leading-relaxed text-zinc-700 dark:text-zinc-300">
            {debugData}
          </pre>
        </div>
      )}

      {!sdkReady && (
        <p className="text-center text-[11px] text-zinc-400">
          Carregando SDK da Meta...
        </p>
      )}
    </div>
  );
}
