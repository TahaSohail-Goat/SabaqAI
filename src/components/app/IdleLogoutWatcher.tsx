'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { IDLE_TIMEOUT_MS } from '@/lib/auth/session-activity';
import { clearAllPageProgress } from '@/lib/persist/page-progress';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

// Client-side half of the idle-timeout story — see src/lib/auth/session-activity.ts for
// the server-enforced half, which is the part that actually can't be bypassed. This
// component only makes the same outcome happen proactively, with a page the user is
// already on, instead of them finding out on their next click that middleware already
// logged them out.
export default function IdleLogoutWatcher() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const logout = async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // Best-effort — middleware/getCurrentUserAndProfile will reject the stale
        // session server-side regardless of whether this call succeeds.
      }
      clearAllPageProgress();
      // Quiz drafts survive logout on purpose — see Sidebar.handleLogout.
      router.push('/login?reason=inactivity');
      router.refresh();
    };

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logout, IDLE_TIMEOUT_MS);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
