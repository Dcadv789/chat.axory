'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChannelsList } from '@/features/channels/components/channels-list';

/**
 * Mostra o toast do retorno do OAuth do Threads (o callback do backend
 * redireciona pra cá com ?threads=connected|error). Isolado num Suspense
 * porque useSearchParams exige boundary no build do Next.
 */
function ThreadsOAuthToast() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const threads = params.get('threads');
    const instagram = params.get('instagram');
    if (!threads && !instagram) return;

    if (threads === 'connected') {
      const name = params.get('name');
      toast.success(name ? `Threads conectado: ${name}` : 'Threads conectado!');
    } else if (threads === 'error') {
      toast.error(`Falha ao conectar o Threads: ${params.get('reason') || 'erro desconhecido'}`);
    }

    if (instagram === 'connected') {
      const name = params.get('name');
      toast.success(name ? `Instagram conectado: ${name}` : 'Instagram conectado!');
    } else if (instagram === 'error') {
      toast.error(
        `Falha ao conectar o Instagram: ${params.get('reason') || 'erro desconhecido'}`,
      );
    }

    // Sem `/dashboard`: o route group `(dashboard)` não faz parte da URL —
    // o caminho antigo levava a um 404 logo após conectar.
    router.replace('/settings/channels');
  }, [params, router]);

  return null;
}

export default function SettingsChannelsPage() {
  return (
    <>
      <Suspense fallback={null}>
        <ThreadsOAuthToast />
      </Suspense>
      <ChannelsList />
    </>
  );
}
