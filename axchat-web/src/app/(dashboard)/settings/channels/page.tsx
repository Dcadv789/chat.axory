'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChannelsList } from '@/features/channels/components/channels-list';

/**
 * Mostra o toast do retorno dos OAuth por redirect (Threads e Instagram Login):
 * o callback do backend redireciona pra cá com ?threads|instagram=connected|error.
 * Isolado num Suspense porque useSearchParams exige boundary no build do Next.
 */
function ChannelOAuthToast() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const providers: Array<{ key: string; label: string }> = [
      { key: 'threads', label: 'Threads' },
      { key: 'instagram', label: 'Instagram' },
    ];
    let handled = false;
    for (const { key, label } of providers) {
      const status = params.get(key);
      if (!status) continue;
      handled = true;
      if (status === 'connected') {
        const name = params.get('name');
        toast.success(name ? `${label} conectado: ${name}` : `${label} conectado!`);
      } else if (status === 'error') {
        toast.error(`Falha ao conectar o ${label}: ${params.get('reason') || 'erro desconhecido'}`);
      }
    }
    if (handled) router.replace('/dashboard/settings/channels');
  }, [params, router]);

  return null;
}

export default function SettingsChannelsPage() {
  return (
    <>
      <Suspense fallback={null}>
        <ChannelOAuthToast />
      </Suspense>
      <ChannelsList />
    </>
  );
}
