'use client';

import { useCallback, useEffect, useState } from 'react';
import { channelsService, type CoexistenceConfig } from '../services/channels.service';
import { extractFbAuthCode } from '../utils/fb-auth-code';
import { assertFbApp, ensureFbSdk } from '../utils/fb-sdk';

/**
 * Abre o popup do Facebook Login for Business e devolve o `code`.
 *
 * Vive fora dos componentes porque duas telas precisam do MESMO popup: conectar
 * um canal novo e reconectar um existente. Duplicar isso significaria manter
 * duas cópias das armadilhas já pagas aqui — o code que vem dentro do
 * `signedRequest`, e o SDK global que confunde os apps do WhatsApp e do
 * Instagram quando as duas telas coexistem.
 */
export function useInstagramLogin() {
  const [config, setConfig] = useState<CoexistenceConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);

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

  const enabled = !!config?.instagramEnabled;
  const configId = config?.instagramConfigId;
  const igAppId = config?.instagramAppId || config?.appId;

  useEffect(() => {
    if (!enabled || !igAppId) return;
    ensureFbSdk(igAppId, () => setSdkReady(true));
  }, [enabled, igAppId]);

  /**
   * Resolve com o `code`, ou rejeita com uma mensagem já pronta pro operador.
   * O SDK do Facebook rejeita callbacks `async`, então envolvemos numa Promise.
   */
  const login = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!window.FB || !configId) {
        reject(new Error('Login da Meta indisponível — configuração ausente.'));
        return;
      }
      // Reafirma o app IMEDIATAMENTE antes do login: entre carregar o SDK e o
      // clique, a tela do WhatsApp pode ter reinicializado com o app dela.
      assertFbApp(igAppId ?? '');
      window.FB.login(
        (response: any) => {
          const code = extractFbAuthCode(response);
          if (!code) {
            const status = response?.status ? ` (status: ${response.status})` : '';
            reject(
              new Error(
                `Não foi possível obter o código de autorização da Meta${status}.`,
              ),
            );
            return;
          }
          resolve(code);
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          // Permissão recusada uma vez fica "grudada": sem `rerequest` a Meta
          // devolve a sessão antiga, com os mesmos escopos negados.
          auth_type: 'rerequest',
        },
      );
    });
  }, [configId, igAppId]);

  return { login, enabled, sdkReady, loadingConfig, igAppId, configId };
}
