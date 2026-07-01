import axios from 'axios';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

let inflight: Promise<boolean> | null = null;

/**
 * Renova o par access/refresh token. SINGLE-FLIGHT: chamadas concorrentes
 * compartilham a MESMA requisição em andamento. Sem isso, vários 401
 * simultâneos (o inbox dispara várias queries juntas) disparariam refreshes
 * paralelos; se o backend rotaciona o refresh token, o primeiro invalida o
 * token que os outros estão usando → 401 em cascata → logout indevido.
 *
 * Usado tanto pelo interceptor do axios quanto pelo recovery do socket.
 * Retorna true se renovou com sucesso.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    if (typeof window === 'undefined') return false;
    // Sessão normal: sem token no localStorage → o cookie httpOnly carrega o
    // refresh (withCredentials). Impersonação/legado: manda o token no body.
    const bodyToken = localStorage.getItem('refresh_token');
    try {
      // axios puro (sem interceptors) pra não entrar em loop de 401.
      const { data } = await axios.post(
        `${API_BASE}/auth/refresh`,
        bodyToken ? { refreshToken: bodyToken } : {},
        { withCredentials: true },
      );
      localStorage.setItem('access_token', data.data.accessToken);
      // Só regrava o refresh no localStorage se a sessão ainda usa body
      // (impersonação/legado). Sessão por cookie não guarda refresh no JS.
      if (bodyToken) {
        localStorage.setItem('refresh_token', data.data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
