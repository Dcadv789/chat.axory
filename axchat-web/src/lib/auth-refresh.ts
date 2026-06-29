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
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return false;
    try {
      // axios puro (sem interceptors) pra não entrar em loop de 401.
      const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
        refreshToken,
      });
      localStorage.setItem('access_token', data.data.accessToken);
      localStorage.setItem('refresh_token', data.data.refreshToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
