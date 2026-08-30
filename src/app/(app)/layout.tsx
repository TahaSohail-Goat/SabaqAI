import React from 'react';
import { redirect } from 'next/navigation';
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

  // A signed-in user with no student_profiles row has never actually chosen a username,
  // board, class or subjects — normal email/password signup always creates one, but Google/
  // OAuth sign-in creates the Supabase auth user directly and skips that form entirely. This
  // is checked here (not just once right after OAuth) so it also catches someone who closes
  // the tab mid-onboarding and comes straight back to /dashboard later, matching the "cannot
  // be dismissed without a profile" rule this page's brief was originally written for.
  if (user && !profile) {
    redirect('/onboarding');
  }

  return (
    <AppShell initialUser={user} initialProfile={profile}>
      {children}
    </AppShell>
  );
}
