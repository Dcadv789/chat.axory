/**
 * Carrega e inicializa o SDK JavaScript do Facebook para um `appId` específico.
 *
 * PROBLEMA QUE ISTO RESOLVE
 * O SDK é global (`window.FB`) e guarda UM appId por página. Cada tela de
 * conexão fazia `if (window.FB) return;` — ou seja, quem carregasse primeiro
 * definia o app para todas as outras.
 *
 * Como WhatsApp e Instagram usam apps Meta DIFERENTES, abrir uma tela e depois
 * a outra sem recarregar a página fazia o segundo login rodar com o appId do
 * primeiro, combinado ao seu próprio `config_id`. App e config de apps
 * diferentes = a Meta recusa com erro genérico ("Sorry, something went wrong",
 * "Recurso indisponível"), sem dizer o motivo. Também explicava o comportamento
 * mudar entre tentativas: dependia de qual aba fora aberta primeiro.
 *
 * `FB.init` pode ser chamado de novo para trocar o appId, então reinicializamos
 * quando o app pedido é diferente do que está carregado.
 */
const FB_SDK_ID = 'facebook-jssdk';
const FB_SDK_SRC = 'https://connect.facebook.net/pt_BR/sdk.js';
const VERSION = 'v25.0';

/** appId com que o SDK está inicializado agora (null = ainda não carregou). */
let currentAppId: string | null = null;

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export function ensureFbSdk(appId: string, onReady: () => void): void {
  if (!appId) return;

  const init = () => {
    window.FB.init({
      appId,
      autoLogAppEvents: true,
      xfbml: false,
      version: VERSION,
    });
    currentAppId = appId;
    onReady();
  };

  if (window.FB) {
    // Já carregado: só reinicializa se for outro app.
    if (currentAppId !== appId) init();
    else onReady();
    return;
  }

  window.fbAsyncInit = init;

  if (!document.getElementById(FB_SDK_ID)) {
    const script = document.createElement('script');
    script.id = FB_SDK_ID;
    script.src = FB_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
  }
}

/**
 * Garante o app certo IMEDIATAMENTE antes de abrir o login. Entre o carregamento
 * do SDK e o clique do usuário, a outra tela pode ter reinicializado com o app
 * dela — esta chamada fecha essa janela de corrida.
 */
export function assertFbApp(appId: string): void {
  if (!appId || !window.FB) return;
  if (currentAppId === appId) return;
  window.FB.init({
    appId,
    autoLogAppEvents: true,
    xfbml: false,
    version: VERSION,
  });
  currentAppId = appId;
}
