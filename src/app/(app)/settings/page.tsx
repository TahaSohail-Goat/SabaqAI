'use client';

import React, { useEffect, useState } from 'react';
import { Lock, Trash2, LogOut, Sun, Moon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useScope } from '@/components/app/ScopeContext';

interface CurrentUser {
  id: string;
  email?: string;
  metadata?: { full_name?: string };
}

// PCTB removed for now, coming back later.
const BOARDS = ['FBISE'];
const CLASS_LEVELS = [9, 10, 11, 12];
const SUBJECTS = [
  { code: 'physics', label: 'Physics' },
  { code: 'chemistry', label: 'Chemistry' },
  { code: 'biology', label: 'Biology' },
  { code: 'mathematics', label: 'Mathematics' },
  { code: 'english', label: 'English' },
  { code: 'urdu', label: 'Urdu' },
];

type Theme = 'light' | 'dark';

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border/60 rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-navy">{title}</h3>
        {description && <p className="text-xs text-text-2 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { board, classLevel, subject, language, setBoard, setClassLevel, setSubject, setLanguage } = useScope();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    fetch('/api/auth/user')
      .then((res) => res.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null));

    const stored = window.localStorage.getItem('sabaqai-theme') as Theme | null;
    setTheme(stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);

  const applyTheme = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('sabaqai-theme', next);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Profile */}
      <SectionCard title="Profile" description="Read-only for now — there's no profile-edit endpoint yet.">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-brand-mint text-brand-dark flex items-center justify-center text-sm font-bold">
              {(user.metadata?.full_name || user.email || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-navy">{user.metadata?.full_name || 'Student'}</p>
              <p className="text-xs text-text-2">{user.email}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-2">You're not signed in — settings here apply to this device only.</p>
        )}
      </SectionCard>

      {/* Study scope */}
      <SectionCard
        title="Study scope"
        description="Filters everything Ask, Quiz and Syllabus can see. Saved to this device."
      >
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-text-3 uppercase tracking-wide mb-2">Board</p>
            <div className="flex flex-wrap gap-2">
              {BOARDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBoard(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    board === b ? 'bg-brand text-white border-brand' : 'bg-surface-2 text-navy-2 border-border hover:border-brand/40'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-text-3 uppercase tracking-wide mb-2">Class</p>
            <div className="flex flex-wrap gap-2">
              {CLASS_LEVELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClassLevel(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    classLevel === c ? 'bg-brand text-white border-brand' : 'bg-surface-2 text-navy-2 border-border hover:border-brand/40'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-text-3 uppercase tracking-wide mb-2">Subject</p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => setSubject(s.code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    subject === s.code
                      ? 'bg-brand text-white border-brand'
                      : 'bg-surface-2 text-navy-2 border-border hover:border-brand/40'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Appearance */}
      <SectionCard title="Appearance">
        <div className="inline-flex rounded-xl border border-border bg-surface-2/60 p-1 gap-1">
          <button
            type="button"
            onClick={() => applyTheme('light')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              theme === 'light' ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'
            }`}
          >
            <Sun className="w-3.5 h-3.5" /> Light
          </button>
          <button
            type="button"
            onClick={() => applyTheme('dark')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              theme === 'dark' ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'
            }`}
          >
            <Moon className="w-3.5 h-3.5" /> Dark
          </button>
        </div>
      </SectionCard>

      {/* Language */}
      <SectionCard title="Language" description="Affects Ask input expectations and text direction.">
        <div className="inline-flex rounded-xl border border-border bg-surface-2/60 p-1 gap-1">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              language === 'en' ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguage('ur')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              language === 'ur' ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'
            }`}
          >
            اردو
          </button>
        </div>
      </SectionCard>

      {/* Account */}
      <SectionCard title="Account">
        <div className="space-y-2.5">
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-surface-2/40 text-text-3 text-xs font-semibold cursor-not-allowed opacity-60"
          >
            <span className="flex items-center gap-2"><Lock className="w-3.5 h-3.5" /> Change password</span>
            <span className="text-[9px] uppercase tracking-wide bg-surface-2 px-1.5 py-0.5 rounded-full">Soon</span>
          </button>
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-surface-2/40 text-text-3 text-xs font-semibold cursor-not-allowed opacity-60"
          >
            <span className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete account & data</span>
            <span className="text-[9px] uppercase tracking-wide bg-surface-2 px-1.5 py-0.5 rounded-full">Soon</span>
          </button>

          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-error/30 bg-error-bg text-error text-xs font-semibold hover:bg-error/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
