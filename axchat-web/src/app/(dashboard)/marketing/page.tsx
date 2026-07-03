'use client';

import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { MarketingPanel } from '@/features/marketing/components/marketing-panel';

export default function MarketingPage() {
  const marketingEnabled = useAuthStore(
    (s) => s.organizations.find((o) => o.id === s.activeOrgId)?.marketingEnabled,
  );

  if (!marketingEnabled) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-white/10">
        <Megaphone className="mx-auto h-8 w-8 text-zinc-300" />
        <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          Módulo de Marketing não habilitado
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          O add-on de Marketing (crew de IA + gestão de anúncios) não está ativo nesta
          organização. Fale com o suporte para habilitar.
        </p>
        <Link href="/inbox" className="mt-4 inline-block text-xs text-primary hover:underline">
          Voltar para o Inbox
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <MarketingPanel />
    </div>
  );
}
