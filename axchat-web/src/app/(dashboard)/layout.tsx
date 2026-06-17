'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SidebarLayout } from '@/components/ui/sidebar-layout';
import { Navbar, NavbarSection, NavbarSpacer } from '@/components/ui/navbar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { useAuthStore } from '@/stores/auth-store';
import { authService } from '@/features/auth/services/auth.service';
import { usePermissionsSync } from '@/features/settings/hooks/use-permissions-sync';
import { ToolFailureBanner } from '@/features/ai-agents/components/tool-failure-banner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, setAuth, activeOrgId, setActiveOrg } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  usePermissionsSync();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.replace('/login');
      return;
    }

    if (user) {
      setIsLoading(false);
      return;
    }

    authService
      .getMe()
      .then((data) => {
        setAuth(data.user, data.organizations);
        // Ensure activeOrgId is set (setAuth handles this, but double-check)
        const currentOrgId = localStorage.getItem('active_org_id');
        if (!currentOrgId && data.organizations.length > 0) {
          setActiveOrg(data.organizations[0].id);
        }
        setIsLoading(false);
      })
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        router.replace('/login');
      });
  }, [router, user, setAuth, setActiveOrg]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarLayout
      sidebar={<AppSidebar />}
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection><></></NavbarSection>
        </Navbar>
      }
    >
      <div className="flex h-full flex-col">
        <ImpersonationBanner />
        <ToolFailureBanner />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </SidebarLayout>
  );
}

function ImpersonationBanner() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [impersonatingUser, setImpersonatingUser] = useState<string | null>(null);

  useEffect(() => {
    setImpersonatingUser(localStorage.getItem('impersonating_user'));
  }, []);

  if (!impersonatingUser) return null;

  const restoreAdmin = () => {
    const accessToken = localStorage.getItem('super_admin_access_token');
    const refreshToken = localStorage.getItem('super_admin_refresh_token');

    localStorage.removeItem('impersonating_user');
    localStorage.removeItem('super_admin_access_token');
    localStorage.removeItem('super_admin_refresh_token');

    if (!accessToken || !refreshToken) {
      logout();
      router.replace('/login');
      return;
    }

    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    setImpersonatingUser(null);
    window.location.href = '/super-admin';
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <span>Voce esta impersonando {impersonatingUser}.</span>
      <button
        onClick={restoreAdmin}
        className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950"
      >
        Voltar ao Super Admin
      </button>
    </div>
  );
}
