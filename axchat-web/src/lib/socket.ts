import { io, Socket } from 'socket.io-client';
import { refreshAccessToken } from './auth-refresh';

let socket: Socket | null = null;
let recovering = false;
let recoverAttempts = 0;

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// Quando o gateway derruba a conexão no handshake (token expirado →
// client.disconnect() no backend), o socket.io-client recebe reason
// "io server disconnect" e NÃO reconecta sozinho. Sem este recovery,
// uma única expiração de access_token mata o realtime até o usuário
// dar F5 — o REST continua funcionando (interceptor do axios renova o
// token), então o app parece vivo mas nenhum message:new chega.
async function recoverFromServerDisconnect() {
  if (recovering || !socket) return;
  recovering = true;
  try {
    // Backoff pra não loopar caso o servidor rejeite por outro motivo
    // (membership removida, org inválida) — aí reconectar nunca vai passar.
    const delay = Math.min(1000 * 2 ** recoverAttempts, 30000);
    recoverAttempts += 1;
    await new Promise((r) => setTimeout(r, delay));
    const ok = await refreshAccessToken();
    if (ok && socket) socket.connect();
  } finally {
    recovering = false;
  }
}

export function getSocket(): Socket {
  if (socket) return socket;

  const url = API_BASE.replace('/api/v1', '');

  socket = io(url, {
    auth: (cb) => {
      const token = localStorage.getItem('access_token');
      const organizationId = localStorage.getItem('active_org_id');
      cb({ token, organizationId });
    },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    // Sem limite de tentativas: com reconnectionAttempts finito o socket
    // desiste PARA SEMPRE após N falhas (ex: deploy de 1min do backend)
    // e o usuário fica sem realtime até recarregar a página.
    reconnectionAttempts: Infinity,
  });

  socket.on('disconnect', (reason) => {
    if (reason !== 'io server disconnect') return;
    void recoverFromServerDisconnect();
  });

  // Handshake completou de verdade (auth + rooms) — zera o backoff.
  socket.on('ready', () => {
    recoverAttempts = 0;
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
