'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { CHAT_MODELS, resolveChatModel } from '@/lib/chat/models';

interface ChatModelSelectorProps {
  modelId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** True when a file is attached — text-only (Groq) models are shown but disabled, since they
   *  can't see the attachment. */
  attachmentPending: boolean;
}

// A themed replacement for a bare native <select> — rounded pill trigger + a floating panel of
// cards (label, description, a provider-colored dot, a checkmark on the active one), matching
// how ChatGPT's own model picker reads, built from this app's existing surface/border/brand
// tokens rather than native form-control chrome.
export default function ChatModelSelector({ modelId, onChange, disabled, attachmentPending }: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = resolveChatModel(modelId);

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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full border border-border bg-surface-2/70 text-[12px] font-semibold text-navy-2 hover:border-brand/40 hover:bg-surface-hover disabled:opacity-60 disabled:pointer-events-none transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${current.provider === 'gemini' ? 'bg-brand' : 'bg-amber-500'}`} />
        {current.label}
        <ChevronDown className={`w-3.5 h-3.5 text-text-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 bottom-full mb-2 left-0 w-72 max-w-[85vw] rounded-2xl border border-border-strong bg-surface shadow-lg p-1.5"
        >
          {CHAT_MODELS.map((m) => {
            const isActive = m.id === modelId;
            const isDisabled = attachmentPending && !m.supportsAttachments;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isActive ? 'bg-selected-surface' : 'hover:bg-surface-hover'
                }`}
              >
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.provider === 'gemini' ? 'bg-brand' : 'bg-amber-500'}`} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] font-semibold ${isActive ? 'text-selected-text' : 'text-navy'}`}>{m.label}</span>
                  <span className={`block text-[11px] mt-0.5 ${isActive ? 'text-selected-text/80' : 'text-text-2'}`}>
                    {isDisabled ? 'Text only — remove the attachment to use this model' : m.description}
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
