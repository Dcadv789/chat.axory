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
    if (!threads) return;
    if (threads === 'connected') {
      const name = params.get('name');
      toast.success(name ? `Threads conectado: ${name}` : 'Threads conectado!');
    } else if (threads === 'error') {
      toast.error(`Falha ao conectar o Threads: ${params.get('reason') || 'erro desconhecido'}`);
    }
    router.replace('/dashboard/settings/channels');
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
