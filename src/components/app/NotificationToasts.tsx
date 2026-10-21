'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import type { StudyNotification } from '@/lib/types';

function Toast({ item, dismiss, open }: { item: StudyNotification; dismiss: () => void; open: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (hovered || focused) return;
    const timeout = window.setTimeout(dismiss, 12_000);
    return () => window.clearTimeout(timeout);
  }, [dismiss, hovered, focused]);
  return <article aria-label="New study notification" className="pointer-events-auto rounded-2xl border border-border bg-surface-elevated p-4 shadow-xl"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="flex items-start gap-3">
      <Bell aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-brand" />
      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-navy">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-text-2">{item.body}</p>
        <Link href={item.href} onClick={open} className="mt-2 inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Open update</Link></div>
      <button type="button" aria-label={`Dismiss ${item.title}`} onClick={dismiss} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-2 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><X className="h-4 w-4" /></button>
    </div>
  </article>;
}

export default function NotificationToasts({ items, dismiss, open }: { items: StudyNotification[]; dismiss: (id: string) => void; open: (item: StudyNotification) => void }) {
  return <aside aria-label="New notification popups" aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
    {items.map(item => <Toast key={item.id} item={item} dismiss={() => dismiss(item.id)} open={() => open(item)} />)}
  </aside>;
}
