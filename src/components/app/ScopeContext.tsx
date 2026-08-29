'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Language } from '@/lib/types';

interface Scope {
  board: string;
  classLevel: number;
  subject: string;
  language: Language;
}

export interface CurrentUser {
  id: string;
  email?: string;
  metadata?: { full_name?: string };
}

export interface Profile {
  board: string;
  classLevel: number;
  examDate: string | null;
  subjects: string[];
}

interface ScopeContextValue extends Scope {
  setBoard: (v: string) => void;
  setClassLevel: (v: number) => void;
  setSubject: (v: string) => void;
  setLanguage: (v: Language) => void;
  // Resolved server-side by (app)/layout.tsx before this ever renders (see initialUser/
  // initialProfile below) — Sidebar/Topbar/Dashboard read identity from here instead of each
  // firing their own client-side fetch after the page has already painted a loading state.
  user: CurrentUser | null;
  profile: Profile | null;
  ready: boolean;
}

const DEFAULT_SCOPE: Scope = {
  // PCTB removed for now, coming back later — FBISE is the only board on offer.
  board: 'FBISE',
  classLevel: 10,
  subject: 'physics',
  language: 'en',
};

const STORAGE_KEY = 'sabaqai-scope';

const ScopeCtx = createContext<ScopeContextValue | null>(null);

interface ScopeProviderProps {
  children: React.ReactNode;
  // A signed-in student's real board/class/subjects, already fetched server-side (this is
  // what makes "Welcome back, {name}" and the scope badge correct on first paint instead of
  // a skeleton-then-pop-in) — null for anonymous/demo sessions, which fall back to whatever
  // was previously saved to localStorage on this device.
  initialUser?: CurrentUser | null;
  initialProfile?: Profile | null;
}

// Board/class/subject/language used to be five useState calls at the top of the old
// single-page app, closed over by every tab. Routed pages can't share a closure, so this
// takes their place — same defaults, now persisted per-device via localStorage.
export function ScopeProvider({ children, initialUser = null, initialProfile = null }: ScopeProviderProps) {
  const [scope, setScope] = useState<Scope>(() => {
    const next = { ...DEFAULT_SCOPE };
    if (initialProfile) {
      next.board = initialProfile.board;
      next.classLevel = initialProfile.classLevel;
      if (initialProfile.subjects?.[0]) next.subject = initialProfile.subjects[0];
    }
    return next;
  });

  // localStorage isn't reachable during the server render that produces initialUser/
  // initialProfile, so the anonymous/demo override still has to be merged in client-side —
  // but only for that case: a real profile from the server already wins over it (matches
  // the previous fetch-based behavior's "profile wins" rule).
  useEffect(() => {
    if (initialProfile) return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setScope((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch {
      // corrupt or inaccessible storage — fall back to defaults silently
    }
  }, [initialProfile]);

  const persist = (next: Scope) => {
    setScope(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort only
    }
  };

  const value: ScopeContextValue = {
    ...scope,
    setBoard: (board) => persist({ ...scope, board }),
    setClassLevel: (classLevel) => persist({ ...scope, classLevel }),
    setSubject: (subject) => persist({ ...scope, subject }),
    setLanguage: (language) => persist({ ...scope, language }),
    user: initialUser,
    profile: initialProfile,
    // Always true: the server already resolved identity before this component ever
    // rendered, so there's no async gap to gate on anymore.
    ready: true,
  };

  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeCtx);
  if (!ctx) throw new Error('useScope must be used within a ScopeProvider');
  return ctx;
}
