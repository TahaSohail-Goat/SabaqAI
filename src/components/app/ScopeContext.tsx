'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Language } from '@/lib/types';

interface Scope {
  board: string;
  classLevel: number;
  subject: string;
  language: Language;
}

interface ScopeContextValue extends Scope {
  setBoard: (v: string) => void;
  setClassLevel: (v: number) => void;
  setSubject: (v: string) => void;
  setLanguage: (v: Language) => void;
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

// Board/class/subject/language used to be five useState calls at the top of the old
// single-page app, closed over by every tab. Routed pages can't share a closure, so this
// takes their place — same defaults, now persisted per-device via localStorage.
export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);

  useEffect(() => {
    let cancelled = false;
    let localOverrides: Partial<Scope> = {};
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) localOverrides = JSON.parse(stored);
    } catch {
      // corrupt or inaccessible storage — fall back to defaults silently
    }

    // A signed-in student's real board/class/subjects (set during /onboarding) is the source of
    // truth and wins over whatever's in localStorage — otherwise onboarding could write a real
    // profile that Ask/Quiz never actually use. Anonymous/demo sessions just get the local value.
    fetch('/api/auth/user')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const next: Scope = { ...DEFAULT_SCOPE, ...localOverrides };
        if (data?.profile) {
          next.board = data.profile.board;
          next.classLevel = data.profile.classLevel;
          if (data.profile.subjects?.[0]) next.subject = data.profile.subjects[0];
        }
        setScope(next);
      })
      .catch(() => {
        if (!cancelled) setScope((prev) => ({ ...prev, ...localOverrides }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
  };

  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeCtx);
  if (!ctx) throw new Error('useScope must be used within a ScopeProvider');
  return ctx;
}
