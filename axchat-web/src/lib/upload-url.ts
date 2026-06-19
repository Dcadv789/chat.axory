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
 * Regras:
 * - URL vazia → undefined
 * - URL já relativa (/api/v1/...) → prefixa com a base da API
 * - URL absoluta que não bate com a base atual → substitui a origin
 * - URL absoluta que já está correta → mantém
 */
export function resolveUploadUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;

  const apiBase = api.defaults.baseURL || '';

  // Já é relativa ao próprio domínio — prefixa com a base da API
  if (url.startsWith('/')) {
    // Se a base tem trailing slash, remove pra não duplicar
    const base = apiBase.replace(/\/+$/, '');
    return `${base}${url}`;
  }

  // URL absoluta — verifica se precisa trocar a origin
  try {
    const parsed = new URL(url);
    const currentOrigin = window.location.origin;
    const apiOrigin = apiBase ? new URL(apiBase).origin : currentOrigin;

    // Se a URL aponta para localhost ou para uma origin diferente da API,
    // substitui pela base correta
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') ||
      (parsed.origin !== apiOrigin && parsed.origin !== currentOrigin)
    ) {
      const base = apiBase.replace(/\/+$/, '');
      return `${base}${parsed.pathname}`;
    }
  } catch {
    // URL inválida — retorna como está
  }

  return url;
}
