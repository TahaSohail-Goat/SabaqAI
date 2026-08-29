import React from 'react';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import AppShell from '@/components/app/AppShell';

// Server Component: the user/profile lookup runs here, during the request, before any HTML
// is sent — every (app) route is already middleware-gated to require a session, so this is
// almost always resolving a real signed-in user anyway. Fetching it here instead of from a
// useEffect in AppShell means Dashboard/Sidebar/Topbar arrive with the real name/board/
// class/subjects already in the markup, instead of painting a loading state first and then
// popping in the real content once a client-side fetch to /api/auth/user resolves.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <AppShell initialUser={user} initialProfile={profile}>
      {children}
    </AppShell>
  );
}
