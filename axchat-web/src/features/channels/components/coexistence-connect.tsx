'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, QrCode, AlertTriangle } from 'lucide-react';
import { channelsService, type CoexistenceConfig } from '../services/channels.service';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';
const FB_SDK_ID = 'facebook-jssdk';

interface SessionInfo {
  phoneNumberId?: string;
  wabaId?: string;
}

interface CoexistenceConnectProps {
  name: string;
  onConnect: (data: {
    code: string;
    phoneNumberId: string;
    businessAccountId: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  /**
   * 'coexistence' = número segue no app + Cloud API (lê QR).
   * 'embedded'    = Embedded Signup padrão (cria/seleciona WABA + número).
   * Muda o config_id, os extras do FB.login e o texto de instrução.
   */
  variant?: 'coexistence' | 'embedded';
}

/**
 * Coexistência via Embedded Signup. O QR code que o dono escaneia no app
 * WhatsApp Business é exibido DENTRO do popup hospedado pela Meta — nós só
 * abrimos o fluxo (FB.login) com o config_id de coexistência e capturamos o
 * `code` + phone_number_id + waba_id que o popup devolve.
 *
 * appId/configId vêm do PlatformSetting (configurados pelo Super Admin) — são
 * credenciais do nosso app Meta (Tech Provider), válidas pra plataforma toda.
 */
export function CoexistenceConnect({
  name,
  onConnect,
  isSubmitting,
  variant = 'coexistence',
}: CoexistenceConnectProps) {
  const isEmbedded = variant === 'embedded';
  const [config, setConfig] = useState<CoexistenceConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionInfoRef = useRef<SessionInfo>({});

  // Busca a config (appId + configId) do backend em runtime.
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

  const enabled = !!config?.enabled;

  // Carrega o SDK do Facebook uma única vez (após ter o appId).
  useEffect(() => {
    if (!enabled || !config?.appId) return;

    if (window.FB) {
      setSdkReady(true);
      return;
    }

    window.fbAsyncInit = () => {
      window.FB.init({
        appId: config.appId,
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
  }, [enabled, config?.appId]);

  // Captura phone_number_id / waba_id emitidos pelo popup via postMessage.
  useEffect(() => {
    if (!enabled) return;

    const handleMessage = (event: MessageEvent) => {
      // Aceita QUALQUER subdomínio do facebook — o popup do Embedded Signup pode
      // emitir de www./web./business.facebook.com dependendo do fluxo (a v4 de
      // coexistência roda em business.facebook.com). Restringir a www. fazia os
      // ids serem descartados → "O popup não retornou o número/conta".
      let host = '';
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        // eslint-disable-next-line no-console
        console.debug('[coex] WA_EMBEDDED_SIGNUP', data.event, data.data);
        // Captura os ids sempre que aparecerem (não só no FINISH) e não sobrescreve
        // com vazio — assim eventos parciais não apagam o que já veio.
        const d = (data.data ?? {}) as Record<string, any>;
        if (d.phone_number_id || d.waba_id) {
          sessionInfoRef.current = {
            phoneNumberId: d.phone_number_id ?? sessionInfoRef.current.phoneNumberId,
            wabaId: d.waba_id ?? sessionInfoRef.current.wabaId,
          };
        }
        if (data.event === 'CANCEL') {
          setError('Conexão cancelada antes de concluir.');
          setLaunching(false);
        }
      } catch {
        // payloads não-JSON do FB são ignorados
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [enabled]);

  const launchConfigId = isEmbedded
    ? config?.embeddedConfigId || config?.configId
    : config?.configId;

  const launch = useCallback(() => {
    if (!window.FB || !launchConfigId) return;
    setError(null);
    setLaunching(true);
    sessionInfoRef.current = {};

    // O SDK do Facebook rejeita callbacks `async` ("Expression is of type
    // asyncfunction, not function"). Mantemos o callback síncrono e disparamos
    // o trabalho assíncrono por dentro.
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
            // O postMessage FINISH pode chegar um instante DEPOIS do callback do
            // code. Espera curta (até ~3s) pelos ids antes de desistir.
            for (
              let i = 0;
              i < 10 &&
              (!sessionInfoRef.current.phoneNumberId || !sessionInfoRef.current.wabaId);
              i++
            ) {
              await new Promise((r) => setTimeout(r, 300));
            }
            const { phoneNumberId, wabaId } = sessionInfoRef.current;
            if (!phoneNumberId || !wabaId) {
              setError(
                'O popup não retornou o número/conta. Conclua a leitura do QR no app WhatsApp Business e tente novamente.',
              );
              setLaunching(false);
              return;
            }
            await onConnect({
              code,
              phoneNumberId,
              businessAccountId: wabaId,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao criar o canal.');
          } finally {
            setLaunching(false);
          }
        })();
      },
      {
        config_id: launchConfigId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          // Coexistência usa o onboarding do app (QR). Embedded padrão NÃO
          // manda featureType — cai no fluxo de criar/selecionar WABA+número.
          // `version: 'v4'` = versão nova do Embedded Signup que suporta o
          // companion pairing (coexistência). Sem ela, o popup usa o fluxo
          // antigo e bate no erro #4563039 no scan do QR.
          ...(isEmbedded
            ? {}
            : { featureType: 'whatsapp_business_app_onboarding', version: 'v4' }),
          sessionInfoVersion: '3',
        },
      },
    );
  }, [onConnect, launchConfigId, isEmbedded]);

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
          Coexistência indisponível: o app Meta da plataforma ainda não foi
          configurado. Peça ao <strong>Super Admin</strong> para preencher App
          ID, App Secret e Config ID em <strong>Integrações</strong>.
        </p>
      </div>
    );
  }

  const busy = launching || isSubmitting;
  const canLaunch = sdkReady && !busy && name.trim().length > 0;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
        {isEmbedded ? (
          <>
            <p className="font-medium">Conectar pela Meta (Embedded Signup)</p>
            <ol className="mt-2 space-y-1.5">
              <li>1. Clique em <strong>Conectar com o Facebook</strong> abaixo.</li>
              <li>2. Faça login com a conta que administra o WhatsApp Business.</li>
              <li>
                3. Na janela da Meta, <strong>selecione ou crie</strong> a conta
                do WhatsApp (WABA) e o <strong>número</strong>.
              </li>
              <li>
                4. Confirme. Nós puxamos as credenciais (token, número, WABA)
                automaticamente — você não digita nada.
              </li>
            </ol>
          </>
        ) : (
          <>
            <p className="font-medium">Como conectar por Coexistência</p>
            <ol className="mt-2 space-y-1.5">
              <li>1. Clique em <strong>Conectar com QR Code</strong> abaixo.</li>
              <li>2. Uma janela da Meta abre com um <strong>QR code</strong>.</li>
              <li>
                3. No celular, abra o <strong>WhatsApp Business</strong> →{' '}
                <strong>Configurações → Dispositivos conectados → Conectar dispositivo</strong>.
              </li>
              <li>4. Escaneie o QR exibido na janela.</li>
              <li>
                5. Confirme na janela da Meta. O número continua funcionando no
                celular <em>e</em> passa a responder pela plataforma.
              </li>
            </ol>
          </>
        )}
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
          <QrCode className="h-4 w-4" />
        )}
        {launching
          ? 'Aguardando conexão...'
          : isSubmitting
            ? 'Criando canal...'
            : isEmbedded
              ? 'Conectar com o Facebook'
              : 'Conectar com QR Code'}
      </button>

      {!sdkReady && (
        <p className="text-center text-[11px] text-zinc-400">
          Carregando SDK da Meta...
        </p>
      )}
    </div>
  );
}
