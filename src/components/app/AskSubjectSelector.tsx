'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, GraduationCap } from 'lucide-react';
import { SUBJECT_LABELS } from '@/lib/subjects';

interface AskSubjectSelectorProps {
  value: string;
  subjects: string[];
  onChange: (subject: string) => void;
}

// Dropdown 0 of /ask's scope picker — which of the student's own enrolled subjects to ask
// from. Ask itself is scoped to a single subject at a time (the same `subject` the rest of
// the app shares via ScopeContext), so switching here changes it globally, the same way the
// Syllabus page's subject filter does — not a local-only toggle.
export default function AskSubjectSelector({ value, subjects, onChange }: AskSubjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (subjects.length <= 1) return null;

  const currentLabel = SUBJECT_LABELS[value] ?? value;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border bg-surface-2/60 text-sm hover:border-brand/40 hover:bg-surface-hover transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <GraduationCap className="w-4 h-4 text-brand flex-shrink-0" />
        <span className="font-semibold text-navy truncate">{currentLabel}</span>
        <ChevronDown className={`w-4 h-4 text-text-3 ml-auto flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 top-full mt-2 left-0 w-full max-h-72 overflow-y-auto rounded-2xl border border-border-strong bg-surface shadow-lg p-1.5"
        >
          {subjects.map((code) => {
            const isActive = code === value;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(code);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-selected-surface' : 'hover:bg-surface-hover'
                }`}
              >
                <span className={`flex-1 min-w-0 text-[13px] font-semibold truncate ${isActive ? 'text-selected-text' : 'text-navy'}`}>
                  {SUBJECT_LABELS[code] ?? code}
                </span>
                {isActive && <Check className="w-4 h-4 text-selected-text flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
