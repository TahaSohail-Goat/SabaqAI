'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ArrowUpRight, Bell, BookOpen, CalendarClock, Check, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, MailOpen, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { fetchNotificationJson, useNotifications } from '@/components/app/NotificationContext';
import { useScope } from '@/components/app/ScopeContext';
import EmptyState from '@/components/app/EmptyState';
import { NOTIFICATION_PAGE_SIZE, NOTIFICATION_TIME_ZONE } from '@/lib/notifications/rules';
import type { NotificationInboxResponse, NotificationKind, NotificationPreferences, StudyNotification } from '@/lib/types';

const KINDS: Record<NotificationKind, { icon: typeof Bell; label: string }> = {
  exam_reminder: { icon: CalendarClock, label: 'Exam reminder' },
  plan_created: { icon: BookOpen, label: 'Plan update' },
  quiz_completed: { icon: ClipboardCheck, label: 'Quiz result' },
};
const PREFERENCES: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: 'examReminders', label: 'Exam reminders', description: 'A reminder 7, 3 and 1 day before a saved exam, and on exam day.' },
  { key: 'planUpdates', label: 'Revision plans', description: 'A confirmation when a revision plan has been saved.' },
  { key: 'quizResults', label: 'Quiz results', description: 'A link to the result and feedback of a completed quiz.' },
];
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-navy-2 transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50';

function timestamp(iso: string) {
  return new Intl.DateTimeFormat('en-PK', { timeZone: NOTIFICATION_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export default function NotificationsPage() {
  const { user } = useScope();
  const { data, loading, refreshing, busy, error, refresh, act, savePreferences } = useNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [pageData, setPageData] = useState<NotificationInboxResponse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [preferenceDraft, setPreferenceDraft] = useState<NotificationPreferences | null>(null);

  useEffect(() => { if (!busy) setPreferenceDraft(null); }, [data?.preferences, busy]);

  useEffect(() => {
    setPageData(null); setPageError(null);
    if (!user || (!unreadOnly && page === 0)) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ offset: String(page * NOTIFICATION_PAGE_SIZE), unread: String(unreadOnly) });
    fetchNotificationJson<NotificationInboxResponse>(`/api/notifications?${params}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setPageData(value); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setPageError(err instanceof Error ? err.message : 'Could not load this page.'); });
    return () => controller.abort();
  }, [page, unreadOnly, data, user]);

  const inbox = !unreadOnly && page === 0 ? data : pageData;
  const visibleError = pageError ?? error;
  const update = async (item: StudyNotification, action: 'read' | 'unread' | 'archive') => {
    if (await act({ action, id: item.id })) { setPage(0); setFeedback(action === 'archive' ? 'Notification archived.' : action === 'read' ? 'Marked as read.' : 'Marked as unread.'); }
  };

  if (!user) return <div className="mx-auto max-w-3xl"><EmptyState icon={Bell} title="Your personal notification inbox" message="Sign in to receive reminders from your saved plans and completed quizzes." ctaHref="/login" ctaLabel="Sign in" /></div>;

  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/15 bg-brand/10 text-brand"><Bell className="h-5 w-5" /></span>
        <div><h2 className="font-display text-xl font-semibold tracking-tight text-navy">A little nudge, right on time</h2><p className="mt-1 max-w-lg text-sm leading-relaxed text-text-2">Reminders from your study plans and practice. Your revision schedule stays in your control.</p></div>
      </div>
      <button type="button" className={buttonClass} disabled={refreshing || busy} onClick={() => { setPage(0); void refresh(true); }}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
    </div>

    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">
        <span className="flex items-center gap-2.5 text-sm font-semibold text-navy"><SlidersHorizontal className="h-4 w-4 text-text-2" /> Notification preferences</span><span className="text-xs text-text-2">In-app only</span>
      </summary>
      <div className="space-y-4 border-t border-border p-4 sm:p-5">
        <p className="text-xs leading-relaxed text-text-2">Updates appear when you open Sabaq AI. Exam reminders use Pakistan time (Asia/Karachi). Turning a category off hides its updates and unread count.</p>
        {PREFERENCES.map(preference => <label key={preference.key} className="flex cursor-pointer items-start justify-between gap-4">
          <span><span className="block text-sm font-semibold text-navy">{preference.label}</span><span className="mt-1 block text-xs leading-relaxed text-text-2">{preference.description}</span></span>
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50" checked={preferenceDraft?.[preference.key] ?? data?.preferences[preference.key] ?? false} disabled={!data || busy}
            onChange={async event => {
              if (!data) return;
              const next = { ...data.preferences, [preference.key]: event.target.checked };
              setPreferenceDraft(next);
              if (await savePreferences(next)) { setPage(0); setFeedback('Notification preferences saved.'); }
              else setPreferenceDraft(null);
            }} />
        </label>)}
      </div>
    </details>

    <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Your notifications">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex rounded-xl bg-surface-muted p-1" aria-label="Filter notifications">
          {[{ value: false, label: 'All updates' }, { value: true, label: 'Unread' }].map(filter => <button key={filter.label} type="button" aria-pressed={unreadOnly === filter.value}
            onClick={() => { setUnreadOnly(filter.value); setPage(0); }} className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${unreadOnly === filter.value ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'}`}>
            {filter.label}{filter.value && data && !error && data.unreadCount > 0 && <span className="ml-2 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand-dark">{data.unreadCount}</span>}
          </button>)}
        </div>
        <button type="button" className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50" disabled={busy || !data?.unreadCount || Boolean(error)}
          onClick={async () => { if (await act({ action: 'mark_all_read' })) { setPage(0); setFeedback('All notifications marked as read.'); } }}><CheckCheck className="h-4 w-4" /> Mark all read</button>
      </div>

      {visibleError ? <div role="status" className="space-y-3 p-6 text-sm text-text-2"><p>{visibleError}</p><button type="button" className={buttonClass} onClick={() => { setPage(0); void refresh(true); }}>Try again</button></div>
        : loading || !inbox ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-text-2"><RefreshCw className="h-4 w-4 animate-spin" /> Loading your updates…</div>
          : !inbox.items.length ? <div className="p-4 sm:p-6"><EmptyState icon={unreadOnly ? CheckCheck : Bell}
            title={unreadOnly ? 'You’re all caught up' : 'No updates yet'}
            message={unreadOnly ? 'There are no unread updates in your enabled categories.' : 'Save a revision plan or complete a quiz. Your personal study updates will appear here.'}
            ctaHref={unreadOnly ? undefined : '/dashboard/plan'} ctaLabel={unreadOnly ? undefined : 'Open your plans'} /></div>
            : <ul className="divide-y divide-border">{inbox.items.map(item => {
              const kind = KINDS[item.kind];
              const Icon = kind.icon;
              return <li key={item.id} className={`flex gap-3 px-4 py-5 sm:gap-4 sm:px-5 ${!item.readAt ? 'bg-brand/5' : ''}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-brand"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-2"><span>{kind.label}</span><span aria-hidden="true">·</span><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time>{!item.readAt && <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand-dark">Unread</span>}</div>
                  <Link href={item.href} onClick={() => { if (!item.readAt) void act({ action: 'read', id: item.id }); }} className="group inline-flex items-start gap-1.5 rounded text-sm font-bold text-navy hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">{item.title}<ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-3 group-hover:text-brand" /></Link>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-2">{item.body}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <button type="button" disabled={busy} onClick={() => void update(item, item.readAt ? 'unread' : 'read')} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-text-2 hover:bg-surface-hover hover:text-navy disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">{item.readAt ? <MailOpen className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} {item.readAt ? 'Mark unread' : 'Mark read'}</button>
                    <button type="button" disabled={busy} onClick={() => void update(item, 'archive')} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-text-2 hover:bg-surface-hover hover:text-navy disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"><Archive className="h-3.5 w-3.5" /> Archive</button>
                  </div>
                </div>
              </li>;
            })}</ul>}

      {inbox && (page > 0 || inbox.hasMore) && <div className="flex items-center justify-between gap-3 border-t border-border p-4">
        <button type="button" className={buttonClass} disabled={page === 0 || busy} onClick={() => setPage(value => value - 1)}><ChevronLeft className="h-4 w-4" /> Previous</button>
        <p className="text-xs text-text-2">Page {page + 1}</p>
        <button type="button" className={buttonClass} disabled={!inbox.hasMore || busy} onClick={() => setPage(value => value + 1)}>Next <ChevronRight className="h-4 w-4" /></button>
      </div>}
    </section>
    <p className="text-center text-xs leading-relaxed text-text-2">Study updates stay in your inbox for up to 30 days. Exam reminders expire at the end of their day.</p>
    <p role="status" aria-live="polite" className="sr-only">{feedback}</p>
  </div>;
}
