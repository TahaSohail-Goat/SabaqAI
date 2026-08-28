'use client';

import React, { useState } from 'react';
import { ScopeProvider } from '@/components/app/ScopeContext';
import Sidebar from '@/components/app/Sidebar';
import Topbar from '@/components/app/Topbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ScopeProvider>
      <div className="min-h-screen bg-page flex">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">{children}</main>
        </div>
      </div>
    </ScopeProvider>
  );
}
