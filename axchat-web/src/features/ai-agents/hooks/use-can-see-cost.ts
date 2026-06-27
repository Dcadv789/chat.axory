'use client';

import { useAuthStore } from '@/stores/auth-store';

/**
 * Custo em dólar é só pra super admin (inclusive navegando via impersonation).
 * O usuário final nunca vê USD — vê a cota do plano em %.
 *
 * Backend já remove o custo das respostas REST pra não-privilegiados; este
 * hook cobre o que vem por socket em tempo real e ajusta a UI.
 */
export function useCanSeeCost(): boolean {
  const user = useAuthStore((s) => s.user);
  const isImpersonating =
    typeof window !== 'undefined' &&
    !!localStorage.getItem('super_admin_access_token');
  return !!user?.isSuperAdmin || isImpersonating;
}
