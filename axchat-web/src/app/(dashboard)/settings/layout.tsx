'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, Users, Tags, Bell, Building2, KeyRound, Sparkles, BookUser, MessageSquareDiff, Zap, Variable, Plug, Clock } from 'lucide-react';

const tabs = [
  { href: '/settings/channels', label: 'Canais', icon: Radio, subtitle: 'Gerencie seus canais de atendimento' },
  { href: '/settings/general', label: 'Geral', icon: Building2, subtitle: 'Configurações gerais da organização' },
  { href: '/settings/ai', label: 'IA', icon: Sparkles, subtitle: 'Configure quando e como os agentes de IA atendem' },
  { href: '/settings/members', label: 'Membros', icon: Users, subtitle: 'Gerencie os membros da sua organização' },
  { href: '/settings/contacts', label: 'Contatos', icon: BookUser, subtitle: 'Lista de contatos e canais vinculados' },
  { href: '/settings/tags', label: 'Tags', icon: Tags, subtitle: 'Organize conversas e contatos com tags coloridas' },
  { href: '/settings/notifications', label: 'Notificações', icon: Bell, subtitle: 'Configure como e quando você deseja ser notificado' },
  { href: '/settings/whatsapp-templates', label: 'Templates WhatsApp', icon: MessageSquareDiff, subtitle: 'Gerencie e sincronize templates do WhatsApp com a Meta' },
  { href: '/settings/quick-replies', label: 'Atalhos', icon: Zap, subtitle: 'Respostas rápidas com /comandos no chat' },
  { href: '/settings/api-keys', label: 'API Keys', icon: KeyRound, subtitle: 'Chaves de acesso programático para integrações' },
  { href: '/settings/secrets', label: 'Variáveis', icon: Variable, subtitle: 'Variáveis de ambiente para Skills HTTP/SQL' },
  { href: '/settings/integrations', label: 'Integrações', icon: Plug, subtitle: 'Conecte Instagram/Meta e Google Business para os agentes de marketing' },
  { href: '/settings/crons', label: 'Crons', icon: Clock, subtitle: 'Agende agentes para rodar tarefas numa cadência (cron)' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = tabs.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)) ?? tabs[0];
  const ActiveIcon = active.icon;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              <span>Configurações</span>
              <span className="font-normal text-zinc-300 dark:text-zinc-600">/</span>
              <span className="inline-flex items-center gap-1.5">
                <ActiveIcon className="h-4 w-4 text-zinc-400" />
                {active.label}
              </span>
            </h1>
            <p className="text-xs text-zinc-500">{active.subtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
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

        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
