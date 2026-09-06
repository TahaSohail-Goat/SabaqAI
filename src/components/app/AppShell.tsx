'use client';

import React, { useEffect, useState } from 'react';
import { ScopeProvider } from '@/components/app/ScopeContext';
import type { CurrentUser, Profile } from '@/lib/auth/get-current-user';
import Sidebar from '@/components/app/Sidebar';
import Topbar from '@/components/app/Topbar';
import IdleLogoutWatcher from '@/components/app/IdleLogoutWatcher';

interface AppShellProps {
  children: React.ReactNode;
  initialUser: CurrentUser | null;
  initialProfile: Profile | null;
}

const SIDEBAR_COLLAPSED_KEY = 'sabaqai-sidebar-collapsed';

export default function AppShell({ children, initialUser, initialProfile }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop-only "icon rail" mode — independent of the mobile drawer's open/close above.
  // Starts expanded (matches every existing screenshot/expectation) and syncs from localStorage
  // after mount, same deferred-read pattern ThemeToggle uses, rather than a lazy useState
  // initializer that would desync from the server-rendered markup on first paint.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === 'true') setSidebarCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  return (
    <ScopeProvider initialUser={initialUser} initialProfile={initialProfile}>
      <IdleLogoutWatcher />
      <div className="min-h-screen bg-page flex">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleCollapsed}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">{children}</main>
        </div>
      </div>
    </ScopeProvider>
  );
}
