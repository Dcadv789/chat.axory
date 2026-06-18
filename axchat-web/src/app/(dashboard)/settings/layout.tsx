'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, Users, Tags, Bell, Building2, KeyRound, Sparkles, BookUser } from 'lucide-react';

const tabs = [
  { href: '/settings/channels', label: 'Canais', icon: Radio },
  { href: '/settings/general', label: 'Geral', icon: Building2 },
  { href: '/settings/ai', label: 'IA', icon: Sparkles },
  { href: '/settings/members', label: 'Membros', icon: Users },
  { href: '/settings/contacts', label: 'Contatos', icon: BookUser },
  { href: '/settings/tags', label: 'Tags', icon: Tags },
  { href: '/settings/notifications', label: 'Notificações', icon: Bell },
  { href: '/settings/api-keys', label: 'API Keys', icon: KeyRound },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Configurações</h1>
        <p className="text-xs text-zinc-500">Gerencie sua organização e integrações</p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="w-full min-w-0">
          <nav className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const isActive = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
                    }`}
                  >
                    <tab.icon className="h-4 w-4 shrink-0" />
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="mt-6 min-h-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
