'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Inbox } from 'lucide-react';
import type { AskSourceType, AskUnit } from '@/lib/types';
import { ASK_SOURCE_META } from '@/lib/ask/source-meta';

interface AskUnitSelectorProps {
  sourceType: AskSourceType;
  units: AskUnit[];
  value: AskUnit | null;
  onChange: (unit: AskUnit) => void;
}

// Dropdown 2 — which chapter (Books) or which specific paper (everything else) within the
// source chosen in dropdown 1. When nothing has been ingested for this category yet, this
// renders an honest empty state instead of an unusable empty dropdown — the whole point of
// this two-step picker is to keep retrieval specific, not to pretend content exists that
// doesn't.
export default function AskUnitSelector({ sourceType, units, value, onChange }: AskUnitSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const meta = ASK_SOURCE_META[sourceType];

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

  if (units.length === 0) {
    return (
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-dashed border-border bg-surface-2/40 text-[13px] text-text-2">
        <Inbox className="w-4 h-4 text-text-3 flex-shrink-0 mt-0.5" />
        <span>No {meta.label.toLowerCase()} have been added for this subject yet.</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border bg-surface-2/60 text-sm hover:border-brand/40 hover:bg-surface-hover transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${value ? 'font-semibold text-navy' : 'font-medium text-text-3'}`}>
          {value ? value.chapterTitle ?? `${meta.unitNoun} ${value.chapterNo}` : `Choose a ${meta.unitNoun.toLowerCase()}`}
        </span>
        <ChevronDown className={`w-4 h-4 text-text-3 ml-auto flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 top-full mt-2 left-0 w-full max-h-72 overflow-y-auto rounded-2xl border border-border-strong bg-surface shadow-lg p-1.5"
        >
          {units.map((u) => {
            const isActive = value?.chapterNo === u.chapterNo;
            return (
              <button
                key={u.chapterNo}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(u);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-selected-surface' : 'hover:bg-surface-hover'
                }`}
              >
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] font-semibold truncate ${isActive ? 'text-selected-text' : 'text-navy'}`}>
                    {u.chapterTitle ?? `${meta.unitNoun} ${u.chapterNo}`}
                  </span>
                  <span className={`block text-[11px] mt-0.5 ${isActive ? 'text-selected-text/80' : 'text-text-2'}`}>
                    {meta.unitNoun} {u.chapterNo}
                  </span>
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
