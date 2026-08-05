'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, Building2, Sparkles, BookUser, Variable, Plug, Clock, Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

const tabs = [
  { href: '/settings/general', label: 'Geral', icon: Building2, subtitle: 'Configurações gerais da organização' },
  { href: '/settings/channels', label: 'Canais', icon: Radio, subtitle: 'Gerencie seus canais de atendimento' },
  { href: '/settings/ai', label: 'IA', icon: Sparkles, subtitle: 'Configure quando e como os agentes de IA atendem' },
  { href: '/settings/contacts', label: 'Contatos', icon: BookUser, subtitle: 'Lista de contatos e canais vinculados' },
  { href: '/settings/secrets', label: 'Variáveis', icon: Variable, subtitle: 'Variáveis de ambiente e chaves de API' },
  { href: '/settings/integrations', label: 'Integrações', icon: Plug, subtitle: 'Conecte Instagram/Meta e Google Business para os agentes de marketing' },
  { href: '/settings/marketing', label: 'Marketing', icon: Megaphone, subtitle: 'Regras da sua empresa que guiam os agentes de marketing' },
  { href: '/settings/crons', label: 'Crons', icon: Clock, subtitle: 'Agende agentes para rodar tarefas numa cadência (cron)' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = tabs.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)) ?? tabs[0];

  return (
    <PageHeader
      icon={active.icon}
      title={active.label}
      subtitle={active.subtitle}
      breadcrumb={[{ label: 'Configurações', href: '/settings' }]}
    >
      <div className="w-full min-w-0 shrink-0">
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
      </div>

      <div className="mt-2">{children}</div>
    </PageHeader>
  );
}
