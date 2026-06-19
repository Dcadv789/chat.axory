import { api } from '@/lib/api';

/**
 * Resolve URLs de upload (imagens, vídeos, áudios, documentos)
 * independentemente de como foram armazenadas no banco.
 *
 * O backend costumava salvar URLs absolutas com o domínio do APP_URL
 * (ex: http://localhost:3001/api/v1/uploads/inbound/...). Quando roda em
 * produção, essas URLs apontam para o lugar errado.
 *
 * Agora o backend salva URLs relativas (/api/v1/uploads/...), mas
 * precisamos garantir compatibilidade com registros antigos.
 *
 * O `api.defaults.baseURL` já inclui /api/v1 (ex: https://api-chat.axory.com.br/api/v1),
 * então quando a URL salva começa com /api/v1 precisamos usar só a ORIGIN.
 */
export function resolveUploadUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;

  const apiBase = api.defaults.baseURL || '';

  // Uploads servidos via rewrite same-origin no Next — evita CORS em prod
  // (chat.axory.com.br carrega /api/v1/uploads/... pelo próprio domínio).
  if (url.startsWith('/api/v1/uploads')) {
    return `${window.location.origin}${url}`;
  }

  // Outras URLs relativas — usa a origin da API
  if (url.startsWith('/')) {
    try {
      const origin = apiBase ? new URL(apiBase).origin : window.location.origin;
      return `${origin}${url}`;
    } catch {
      return url;
    }
  }

  // URL absoluta — verifica se precisa trocar a origin
  try {
    const parsed = new URL(url);
    const currentOrigin = window.location.origin;
    let apiOrigin: string;
    try {
      apiOrigin = apiBase ? new URL(apiBase).origin : currentOrigin;
    } catch {
      apiOrigin = currentOrigin;
    }

    // URLs de upload absolutas (legado ou resolvidas pela API) → proxy same-origin
    if (parsed.pathname.startsWith('/api/v1/uploads')) {
      return `${currentOrigin}${parsed.pathname}${parsed.search}`;
    }

    // Se a URL aponta para localhost ou para uma origin diferente da API,
    // substitui pela base correta
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') ||
      (parsed.origin !== apiOrigin && parsed.origin !== currentOrigin)
    ) {
      return `${apiOrigin}${parsed.pathname}`;
    }
  } catch {
    // URL inválida — retorna como está
  }

  return url;
}
