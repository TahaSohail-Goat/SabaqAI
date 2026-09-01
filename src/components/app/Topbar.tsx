'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Sun, Moon } from 'lucide-react';
import { useScope } from './ScopeContext';

type Theme = 'light' | 'dark';

// One place that names every page in the shell — Topbar derives its title from the route so
// no page has to remember to pass one down through the shared layout.
const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Where you are and what to do next.' },
  '/doubts': { title: 'Doubts', subtitle: 'Grounded answers with page citations, or an honest refusal.' },
  '/chat': { title: 'Chat', subtitle: 'Open conversation with Gemini — not bound to your syllabus.' },
  '/quiz': { title: 'Quiz', subtitle: 'Board-pattern questions generated from your chapters.' },
  '/syllabus': { title: 'Syllabus', subtitle: 'What Sabaq AI actually knows, chapter by chapter.' },
  '/explore': { title: 'Explore', subtitle: 'Fly through your subjects — pick a book to open it.' },
  '/eval': { title: 'Evaluation', subtitle: 'Internal — retrieval accuracy and refusal safety.' },
  '/settings': { title: 'Settings', subtitle: 'Your profile, study scope, and appearance.' },
};

function metaFor(pathname: string | null) {
  if (!pathname) return { title: 'SabaqAI' };
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const base = '/' + pathname.split('/')[1];
  return PAGE_META[base] ?? { title: 'SabaqAI' };
}

interface TopbarProps {
  onOpenSidebar: () => void;
}

export default function Topbar({ onOpenSidebar }: TopbarProps) {
  // board/class used to be pickable here too, duplicating what's now captured once at
  // signup (and shown for real accounts via ScopeContext's profile hydration) — this is
  // just a read-out now, not another place to change it.
  const { board, classLevel } = useScope();
  const pathname = usePathname();
  const { title, subtitle } = metaFor(pathname);

  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('sabaqai-theme') as Theme | null;
    setTheme(stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('sabaqai-theme', next);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-surface-elevated/95 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="lg:hidden shrink-0 p-2 -ml-2 rounded-lg text-navy-2 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-navy truncate">
            {title}
          </h1>
          {subtitle && <p className="text-xs text-text-2 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className="hidden sm:inline-flex items-center rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-navy-2"
          title="Set during sign-up"
        >
          {board} · Class {classLevel}
        </span>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-muted text-navy-2 hover:bg-surface-hover hover:text-navy transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
