'use client';

import {
  LayoutDashboard,
  Crown,
  Settings,
  LogOut,
  ChevronsUpDown,
  Building2,
  ChevronUp,
  Zap,
  Headset,
  Megaphone,
} from 'lucide-react';
import { InboxTree } from '@/features/inbox-views/components/inbox-tree';
import { AgentSectorTree } from '@/features/ai-agents/components/agent-sector-tree';
import { PipelinesTree } from '@/features/pipelines/components/pipelines-tree';
import { ThemeToggle } from '@/components/theme-toggle';

import { useAuthStore } from '@/stores/auth-store';
import { Avatar } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarHeader,
  SidebarBody,
  SidebarFooter,
  SidebarSection,
  SidebarItem,
  SidebarLabel,
  SidebarSpacer,
} from '@/components/ui/sidebar';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownLabel,
  DropdownDivider,
} from '@/components/ui/dropdown';

// Dashboard é renderizado no topo (antes do Inbox); aqui ficam os demais.
const navItems = [
  { href: '/automations', label: 'Automações', icon: Zap },
];

export function AppSidebar() {
  const { user, organizations, activeOrgId, setActiveOrg, logout } =
    useAuthStore();
  const activeOrg = organizations.find((o) => o.id === activeOrgId);

  const handleOrgSwitch = (orgId: string) => {
    setActiveOrg(orgId);
    window.location.reload();
  };

  return (
    <Sidebar>
      <SidebarHeader className="h-16 shrink-0 justify-center py-0">
        <Dropdown>
          <DropdownButton className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm/6 font-semibold text-zinc-950 hover:bg-zinc-100 dark:text-white dark:hover:bg-white/10">
            <Avatar
              initials={activeOrg?.name?.slice(0, 2).toUpperCase()}
              className="size-6 bg-primary text-[10px] text-primary-foreground"
              square
            />
            <span className="min-w-0 flex-1 truncate">
              {activeOrg?.name ?? 'Organização'}
            </span>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
          </DropdownButton>
          {organizations.length > 1 && (
            <DropdownMenu anchor="bottom start" className="min-w-56">
              {organizations.map((org) => (
                <DropdownItem
                  key={org.id}
                  onClick={() => handleOrgSwitch(org.id)}
                >
                  <Building2 />
                  <DropdownLabel>{org.name}</DropdownLabel>
                </DropdownItem>
              ))}
            </DropdownMenu>
          )}
        </Dropdown>
      </SidebarHeader>

      <SidebarBody>
        <SidebarSection>
          <SidebarItem href="/dashboard">
            <LayoutDashboard className="size-5" />
            <SidebarLabel>Dashboard</SidebarLabel>
          </SidebarItem>
          <InboxTree />
          <PipelinesTree />
          <AgentSectorTree
            label="Atendimento"
            icon={Headset}
            sector="atendimento"
          />
          {activeOrg?.marketingEnabled && (
            <AgentSectorTree
              label="Marketing"
              icon={Megaphone}
              sector="marketing"
            />
          )}
          {activeOrg?.marketingEnabled && (
            <SidebarItem href="/marketing">
              <Megaphone className="size-5" />
              <SidebarLabel>Painel de Marketing</SidebarLabel>
            </SidebarItem>
          )}
          {navItems.map((item) => (
            <SidebarItem key={item.href} href={item.href}>
              <item.icon className="size-5" />
              <SidebarLabel>{item.label}</SidebarLabel>
            </SidebarItem>
          ))}
          {user?.isSuperAdmin && (
            <SidebarItem href="/super-admin">
              <Crown className="size-5" />
              <SidebarLabel>Super Admin</SidebarLabel>
            </SidebarItem>
          )}
        </SidebarSection>

        <SidebarSpacer />
      </SidebarBody>

      <SidebarFooter>
        <div className="px-1 pb-2">
          <ThemeToggle />
        </div>
        <Dropdown>
          <DropdownButton className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-zinc-100 dark:hover:bg-white/10">
            <Avatar
              src={user?.avatarUrl}
              initials={user?.name?.slice(0, 2).toUpperCase()}
              className="size-10"
              square
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                {user?.name}
              </span>
              <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                {user?.email}
              </span>
            </span>
            <ChevronUp className="ml-auto size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
          </DropdownButton>
          <DropdownMenu anchor="top start" className="min-w-56">
            <DropdownItem href="/settings">
              <Settings />
              <DropdownLabel>Configurações</DropdownLabel>
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem onClick={logout}>
              <LogOut />
              <DropdownLabel>Sair</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </SidebarFooter>
    </Sidebar>
  );
}
