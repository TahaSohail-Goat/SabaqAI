'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CheckCheck, RefreshCw, ArrowUpRight } from 'lucide-react';
import { useNotifications } from './NotificationContext';

export default function NotificationBell() {
  const { data, loading, refreshing, busy, error, refresh, act } = useNotifications();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const unread = error ? null : data?.unreadCount;

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return <div className="relative" ref={container}>
    <button type="button" ref={trigger}
      onClick={() => { setOpen(value => !value); if (!open) void refresh(true); }}
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      aria-expanded={open} aria-controls="notification-preview" title="Notifications"
      className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${open || pathname === '/notifications' ? 'border-brand bg-brand text-white' : 'border-border bg-surface-muted text-navy-2 hover:bg-surface-hover hover:text-navy'}`}>
      <Bell className="h-4 w-4" />
      {Boolean(unread) && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-4 rounded-full bg-brand-dark px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-surface-elevated">{unread! > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section id="notification-preview" aria-label="Notification preview"
      className="fixed inset-x-4 top-24 z-50 overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-96">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div><p className="text-sm font-bold text-navy">Notifications</p><p className="mt-0.5 text-xs text-text-2">Your latest study updates</p></div>
        <button type="button" disabled={busy || !unread} onClick={() => void act({ action: 'mark_all_read' })}
          aria-label="Mark all notifications as read" title="Mark all as read"
          className="rounded-lg p-2 text-brand hover:bg-surface-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"><CheckCheck className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[min(24rem,60dvh)] overflow-y-auto">
        {loading ? <p role="status" className="p-6 text-center text-sm text-text-2">Loading notifications…</p>
          : error ? <div role="status" className="space-y-3 p-5 text-sm text-text-2"><p>{error}</p><button type="button" onClick={() => void refresh(true)} className="font-semibold text-brand">Try again</button></div>
            : !data?.items.length ? <div className="px-5 py-8 text-center"><Bell className="mx-auto mb-3 h-6 w-6 text-text-3" /><p className="text-sm font-semibold text-navy">You’re all caught up</p><p className="mt-1 text-xs leading-relaxed text-text-2">Saved plans and completed quizzes will bring your updates here.</p></div>
              : data.items.slice(0, 5).map(item => <Link key={item.id} href={item.href}
                onClick={() => { if (!item.readAt) void act({ action: 'read', id: item.id }); setOpen(false); }}
                className={`block border-b border-border px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50 ${!item.readAt ? 'bg-brand/5' : ''}`}>
                <p className="flex items-start gap-2 text-sm font-semibold text-navy">{!item.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />}{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-text-2">{item.body}</p>
              </Link>)}
      </div>
      <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-brand hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50">
        {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ArrowUpRight className="h-3.5 w-3.5" />} View all notifications
      </Link>
    </section>}
  </div>;
}
