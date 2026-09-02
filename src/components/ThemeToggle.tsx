'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  window.localStorage.setItem('sabaqai-theme', theme);
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('sabaqai-theme') as Theme | null;
    setTheme(stored ?? 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`flex items-center justify-center h-11 w-11 rounded-full bg-white/90 backdrop-blur-md border border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ${className}`}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-[#294454]" />
      ) : (
        <Moon className="w-4 h-4 text-[#294454]" />
      )}
    </button>
  );
}
