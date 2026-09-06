'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  MessagesSquare,
  Award,
  BookOpen,
  Orbit,
  TrendingUp,
  CalendarClock,
  Settings,
  LogOut,
  LogIn,
  UserPlus,
  X,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import NavItem from './NavItem';
import SabaqLogoBadge from '@/components/SabaqLogoBadge';
import { useScope } from './ScopeContext';
import { clearAllPageProgress } from '@/lib/persist/page-progress';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  /** Desktop-only icon rail mode. Never applies to the mobile drawer, which is already a
   *  temporary overlay with its own open/close. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapsed }: SidebarProps) {
  const router = useRouter();
  // user/profile come from ScopeContext, resolved server-side by (app)/layout.tsx before this
  // ever renders — no client fetch, no "shows the old thing for a moment" gap on this footer.
  const { user, profile } = useScope();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      // The in-progress question/quiz/chat draft each page persists to localStorage is scoped
      // by account id already, but clearing it here too means a shared device never even holds
      // onto it past this point instead of relying solely on the next login's id mismatch.
      clearAllPageProgress();
      // Un-submitted quiz drafts deliberately survive logout (they're keyed + filtered by
      // account id, and pruned for the next user on the history page) so a student can resume
      // them after signing back in.
      router.push('/login');
    } catch (e) {
      console.error(e);
    } finally {
      setConfirmingLogout(false);
    }
  };

  const displayName = user?.metadata?.full_name || user?.email?.split('@')[0] || 'Student';
  const initial = displayName.charAt(0).toUpperCase();

  // Shared between the desktop rail and the mobile drawer — `rail` is only ever true for the
  // desktop `<aside>` below; the mobile drawer always renders expanded regardless of the
  // desktop collapse preference, since it's a temporary overlay with plenty of width already.
  const renderBody = (rail: boolean) => (
    <div className="flex h-full flex-col bg-surface-elevated">
      {/* Logo */}
      <div className={`flex items-center gap-2 pt-6 pb-5 ${rail ? 'flex-col px-2' : 'justify-between px-5'}`}>
        <Link
          href="/dashboard"
          className={`flex items-center gap-2.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded-lg ${rail ? 'flex-col' : ''}`}
        >
          <SabaqLogoBadge size={36} />
          {!rail && (
            <span className="font-display text-xl font-semibold tracking-tight text-navy">
              Sabaq<span className="text-brand">AI</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onClose}
          className={`p-1.5 rounded-lg text-text-2 hover:bg-surface-hover hover:text-navy transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
            rail ? 'hidden' : 'lg:hidden'
          }`}
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
        {/* Desktop collapse toggle — hidden in the mobile drawer render (rail is always false
            there), and hidden below lg where the drawer takes over entirely. */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={`hidden lg:flex items-center justify-center p-1.5 rounded-lg text-text-2 hover:bg-surface-hover hover:text-navy transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
            rail ? '' : 'shrink-0'
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto space-y-6 ${rail ? 'px-2' : 'px-3'}`}>
        <div className="space-y-1">
          {!rail && <p className="px-3.5 mb-1.5 text-[10px] font-bold text-text-2 uppercase tracking-wider">Workspace</p>}
          <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" onNavigate={onClose} collapsed={rail} exact />
          <NavItem href="/doubts" icon={Search} label="Doubts" onNavigate={onClose} collapsed={rail} />
          <NavItem href="/chat" icon={MessagesSquare} label="Chat" onNavigate={onClose} collapsed={rail} />
          <NavItem href="/quiz" icon={Award} label="Quiz" onNavigate={onClose} collapsed={rail} />
          <NavItem href="/syllabus" icon={BookOpen} label="Syllabus" onNavigate={onClose} collapsed={rail} />
          <NavItem href="/explore" icon={Orbit} label="Explore" onNavigate={onClose} collapsed={rail} />
        </div>

        <div className="space-y-1">
          {!rail && <p className="px-3.5 mb-1.5 text-[10px] font-bold text-text-2 uppercase tracking-wider">Insights</p>}
          <NavItem href="/dashboard/progress" icon={TrendingUp} label="Progress" onNavigate={onClose} collapsed={rail} />
          <NavItem href="/dashboard/plan" icon={CalendarClock} label="Plan" onNavigate={onClose} collapsed={rail} />
        </div>
      </nav>

      {/* Footer */}
      <div className={`mt-auto border-t border-border space-y-2 ${rail ? 'p-2' : 'p-3'}`}>
        <NavItem href="/settings" icon={Settings} label="Settings" onNavigate={onClose} collapsed={rail} />

        {user ? (
          rail ? (
            <div className="flex flex-col items-center gap-2 pt-1">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatars are user-uploaded
                // Supabase Storage URLs, not build-time-known assets next/image can optimize.
                <img src={profile.avatarUrl} alt="" title={displayName} className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <div
                  title={displayName}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-brand-dark text-xs font-bold"
                >
                  {initial}
                </div>
              )}
              <button
                type="button"
                onClick={confirmingLogout ? handleLogout : () => setConfirmingLogout(true)}
                onBlur={() => setConfirmingLogout(false)}
                title={confirmingLogout ? 'Confirm sign out' : 'Sign out'}
                className={`p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50 ${
                  confirmingLogout ? 'text-error bg-error-bg' : 'text-text-2 hover:bg-error-bg hover:text-error'
                }`}
              >
                {confirmingLogout ? <Check className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3 py-2 mt-1 rounded-xl bg-surface-muted">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatars are user-uploaded
                // Supabase Storage URLs, not build-time-known assets next/image can optimize.
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-brand-dark text-xs font-bold">
                  {initial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-navy truncate">{displayName}</p>
                <p className="text-[10px] text-text-2 truncate">{user.email}</p>
              </div>
              {confirmingLogout ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Confirm sign out"
                    className="p-1.5 rounded-lg text-error hover:bg-error-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingLogout(false)}
                    title="Cancel"
                    className="p-1.5 rounded-lg text-text-2 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingLogout(true)}
                  title="Sign out"
                  className="p-1.5 rounded-lg text-text-2 hover:bg-error-bg hover:text-error transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )
        ) : rail ? (
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <Link
              href="/login"
              title="Log in"
              className="flex items-center justify-center p-2 rounded-xl text-navy-2 border border-border-strong hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <LogIn className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/signup"
              title="Sign up"
              className="flex items-center justify-center p-2 rounded-xl text-white bg-brand hover:bg-brand-dark shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1 pt-1">
            <Link
              href="/login"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-navy-2 border border-border-strong hover:bg-surface-hover hover:border-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <LogIn className="w-3.5 h-3.5" />
              Log in
            </Link>
            <Link
              href="/signup"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-brand hover:bg-brand-dark shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Sign up
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  const railWidth = collapsed ? 'w-[76px]' : 'w-64';

  return (
    <>
      {/* Desktop: fixed column — border-r is the primary "this is a separate region" signal.
          Width transitions smoothly between the two states rather than snapping. */}
      <aside className={`hidden lg:block shrink-0 border-r border-border transition-[width] duration-200 ${railWidth}`}>
        <div className={`fixed h-screen transition-[width] duration-200 ${railWidth}`}>{renderBody(collapsed)}</div>
      </aside>

      {/* Mobile: off-canvas drawer — always renders expanded regardless of the desktop
          collapse preference (rail=false), since it's a temporary overlay with its own
          open/close and plenty of width already. */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl transition-transform duration-300 ease-out ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {renderBody(false)}
        </div>
      </div>
    </>
  );
}
