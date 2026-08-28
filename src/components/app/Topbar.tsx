'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown } from 'lucide-react';
import { useScope } from './ScopeContext';

// PCTB removed for now, coming back later.
const BOARDS = ['FBISE'];
const CLASS_LEVELS = [9, 10, 11, 12];

// One place that names every page in the shell — Topbar derives its title from the route so
// no page has to remember to pass one down through the shared layout.
const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Where you are and what to do next.' },
  '/ask': { title: 'Ask', subtitle: 'Grounded answers with page citations, or an honest refusal.' },
  '/quiz': { title: 'Quiz', subtitle: 'Board-pattern questions generated from your chapters.' },
  '/syllabus': { title: 'Syllabus', subtitle: 'What Sabaq AI actually knows, chapter by chapter.' },
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
  const { board, classLevel, setBoard, setClassLevel } = useScope();
  const [scopeOpen, setScopeOpen] = useState(false);
  const pathname = usePathname();
  const { title, subtitle } = metaFor(pathname);

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

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setScopeOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-muted px-3 py-1.5 text-xs font-semibold text-navy-2 hover:border-brand/50 hover:text-navy transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <span>{board} · Class {classLevel}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${scopeOpen ? 'rotate-180' : ''}`} />
        </button>

        {scopeOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setScopeOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-border-strong bg-surface p-3 shadow-xl shadow-navy/20 space-y-3">
              <div>
                <p className="text-[10px] font-bold text-text-2 uppercase tracking-wide mb-1.5">Board</p>
                <div className="flex flex-wrap gap-1.5">
                  {BOARDS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBoard(b)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        board === b
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface-muted text-navy-2 border-border hover:border-brand/40'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-text-2 uppercase tracking-wide mb-1.5">Class</p>
                <div className="flex flex-wrap gap-1.5">
                  {CLASS_LEVELS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setClassLevel(c)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        classLevel === c
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface-muted text-navy-2 border-border hover:border-brand/40'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
