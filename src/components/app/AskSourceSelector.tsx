'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { AskSourceOption, AskSourceType } from '@/lib/types';
import { ASK_SOURCE_META } from '@/lib/ask/source-meta';

interface AskSourceSelectorProps {
  value: AskSourceType | null;
  sources: AskSourceOption[];
  onChange: (sourceType: AskSourceType) => void;
  loading?: boolean;
}

// Dropdown 1 of /ask's two-step scope picker — same themed-panel pattern as
// ChatModelSelector (rounded trigger + floating option cards), not a native <select>.
export default function AskSourceSelector({ value, sources, onChange, loading }: AskSourceSelectorProps) {
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

  const current = value ? ASK_SOURCE_META[value] : null;
  const CurrentIcon = current?.icon;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border bg-surface-2/60 text-sm hover:border-brand/40 hover:bg-surface-hover disabled:opacity-60 disabled:pointer-events-none transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {CurrentIcon ? (
          <CurrentIcon className="w-4 h-4 text-brand flex-shrink-0" />
        ) : (
          <span className="w-4 h-4 rounded-full border-2 border-dashed border-text-3 flex-shrink-0" />
        )}
        <span className={current ? 'font-semibold text-navy' : 'font-medium text-text-3'}>
          {current ? current.label : loading ? 'Loading sources…' : 'Choose a source'}
        </span>
        <ChevronDown className={`w-4 h-4 text-text-3 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 top-full mt-2 left-0 w-full rounded-2xl border border-border-strong bg-surface shadow-lg p-1.5"
        >
          {sources.map((s) => {
            const meta = ASK_SOURCE_META[s.sourceType];
            const Icon = meta.icon;
            const isActive = s.sourceType === value;
            const count = s.units.length;
            return (
              <button
                key={s.sourceType}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(s.sourceType);
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-selected-surface' : 'hover:bg-surface-hover'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isActive ? 'text-selected-text' : 'text-brand'}`} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] font-semibold ${isActive ? 'text-selected-text' : 'text-navy'}`}>
                    {meta.label}
                  </span>
                  <span className={`block text-[11px] mt-0.5 ${isActive ? 'text-selected-text/80' : 'text-text-2'}`}>
                    {count === 0
                      ? 'Nothing ingested yet'
                      : `${count} ${meta.unitNoun.toLowerCase()}${count === 1 ? '' : 's'} available`}
                  </span>
                </span>
                {isActive && <Check className="w-4 h-4 text-selected-text flex-shrink-0 mt-1" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
