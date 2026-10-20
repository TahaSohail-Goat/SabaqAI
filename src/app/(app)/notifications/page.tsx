'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, ArrowUpRight, Bell, BookOpen, CalendarClock, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { fetchNotificationJson, useNotifications } from '@/components/app/NotificationContext';
import { useScope } from '@/components/app/ScopeContext';
import EmptyState from '@/components/app/EmptyState';
import { NOTIFICATION_PAGE_SIZE, NOTIFICATION_TIME_ZONE } from '@/lib/notifications/rules';
import type { NotificationActionRequest, NotificationInboxResponse, NotificationKind, NotificationPreferences, StudyNotification } from '@/lib/types';

const KINDS: Record<NotificationKind, { icon: typeof Bell; label: string }> = {
  exam_reminder: { icon: CalendarClock, label: 'Exam reminder' },
  plan_created: { icon: BookOpen, label: 'Plan update' },
  quiz_completed: { icon: ClipboardCheck, label: 'Quiz result' },
};
const PREFERENCES: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: 'examReminders', label: 'Exam reminders', description: '7, 3 and 1 day before a saved exam, and on exam day.' },
  { key: 'planUpdates', label: 'Revision plans', description: 'A confirmation when a revision plan has been saved.' },
  { key: 'quizResults', label: 'Quiz results', description: 'A link to the result and feedback of a completed quiz.' },
  { key: 'popups', label: 'Popup alerts', description: 'New updates appear in the bottom-right corner while the app is open. Dismissing a popup leaves the update unread in your inbox.' },
];
const FILTERS = [{ value: 'inbox', label: 'All updates' }, { value: 'unread', label: 'Unread' }, { value: 'archived', label: 'Archived' }] as const;
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-navy-2 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50';
const fieldClass = 'min-h-10 min-w-0 rounded-xl border border-border bg-surface px-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-brand/50';
function timestamp(iso: string) {
  return new Intl.DateTimeFormat('en-PK', { timeZone: NOTIFICATION_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export default function NotificationsPage() {
  const { user, profile } = useScope();
  const { data, loading, refreshing, busy, error, refresh, act, savePreferences } = useNotifications();
  const [view, setView] = useState<'inbox' | 'unread' | 'archived'>('inbox');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [pageData, setPageData] = useState<NotificationInboxResponse | null>(null);
  const [pageDataKey, setPageDataKey] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [undo, setUndo] = useState<NotificationActionRequest | null>(null);
  const [preferenceDraft, setPreferenceDraft] = useState<NotificationPreferences | null>(null);
  const defaultView = view === 'inbox' && !kind && !query && page === 0;
  const resultKey = `${user?.id}:${profile?.board}:${profile?.classLevel}:${profile?.subjects.join(',')}:${view}:${kind}:${query}:${page}`;

  useEffect(() => { if (!busy) setPreferenceDraft(null); }, [data?.preferences, busy]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  // Selection survives passive polling but resets when the user changes the result set.
  useEffect(() => { setSelected([]); }, [view, kind, query, page]);
  useEffect(() => {
    setPageError(null);
    if (!user || defaultView) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ offset: String(page * NOTIFICATION_PAGE_SIZE), view });
    if (kind) params.set('kind', kind);
    if (query) params.set('q', query);
    fetchNotificationJson<NotificationInboxResponse>(`/api/notifications?${params}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setPageData(value); setPageDataKey(resultKey); } })
      .catch((err: unknown) => { if (!controller.signal.aborted) setPageError(err instanceof Error ? err.message : 'Could not load this page.'); });
    return () => controller.abort();
  }, [page, view, kind, query, data, user, defaultView, resultKey]);

  const inbox = defaultView ? data : pageDataKey === resultKey ? pageData : null;
  const visibleError = pageError ?? error;
  const selectedIds = selected.filter(id => inbox?.items.some(item => item.id === id));
  const update = async (item: StudyNotification, action: 'read' | 'unread' | 'archive' | 'restore' | 'delete') => {
    if (action === 'delete' && !window.confirm('Delete this notification from your inbox and archive? This cannot be undone. Your saved plan or quiz result will be kept.')) return;
    if (await act({ action, id: item.id })) {
      setPage(0); setSelected([]);
      setUndo(action === 'archive' ? { action: 'restore', id: item.id } : action === 'restore' ? { action: 'archive', id: item.id } : null);
      setFeedback(action === 'delete' ? 'Notification deleted.' : action === 'archive' ? 'Notification moved to Archived.' : action === 'restore' ? 'Restored with its original read status. Enable its category to see it in your inbox.' : action === 'read' ? 'Marked as read.' : 'Marked as unread.');
    }
  };
  const bulk = async (action: 'read_many' | 'archive_many' | 'restore_many' | 'delete_many') => {
    const ids = selectedIds;
    if (action === 'delete_many' && !window.confirm(`Delete ${ids.length} selected notifications from your inbox and archive? This cannot be undone. Your saved plans and quiz results will be kept.`)) return;
    if (await act({ action, ids })) {
      setPage(0); setSelected([]);
      setUndo(action === 'archive_many' ? { action: 'restore_many', ids } : action === 'restore_many' ? { action: 'archive_many', ids } : null);
      setFeedback(action === 'delete_many' ? 'Selected notifications deleted.' : action === 'archive_many' ? 'Selected updates moved to Archived.' : action === 'restore_many' ? 'Selected updates restored. Enable their categories to see them in your inbox.' : 'Selected updates marked as read.');
    }
  };

  if (!user) return <div className="mx-auto max-w-3xl"><EmptyState icon={Bell} title="Your personal notification inbox" message="Sign in to receive reminders from your saved plans and completed quizzes." ctaHref="/login" ctaLabel="Sign in" /></div>;

  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/15 bg-brand/10 text-brand"><Bell className="h-5 w-5" /></span>
        <div><h2 className="font-display text-xl font-semibold tracking-tight text-navy">A little nudge, right on time</h2><p className="mt-1 text-sm leading-relaxed text-text-2">Your study updates, reminders and saved results.</p></div>
      </div>
      <button type="button" className={buttonClass} disabled={refreshing || busy} onClick={() => { setPage(0); void refresh(true); }}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
    </div>
    <details className="rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"><span className="flex items-center gap-2.5 text-sm font-semibold text-navy"><SlidersHorizontal className="h-4 w-4" /> Notification preferences</span><span className="text-xs text-text-2">In-app only</span></summary>
      <div className="space-y-4 border-t border-border p-4 sm:p-5">
        <p className="text-xs leading-relaxed text-text-2">Updates sync every 15 seconds while the app is visible, and after saving a plan or quiz result. Exam reminders use Pakistan time. Category switches hide inbox updates and unread counts; Archived remains accessible.</p>
        {PREFERENCES.map(preference => <label key={preference.key} className="flex cursor-pointer items-start justify-between gap-4">
          <span><span className="block text-sm font-semibold text-navy">{preference.label}</span><span className="mt-1 block text-xs leading-relaxed text-text-2">{preference.description}</span></span>
          <input type="checkbox" aria-label={preference.label} className="mt-1 h-5 w-5 shrink-0 accent-brand" checked={preferenceDraft?.[preference.key] ?? data?.preferences[preference.key] ?? false} disabled={!data || busy}
            onChange={async event => {
              if (!data) return;
              const next = { ...data.preferences, [preference.key]: event.target.checked };
              setPreferenceDraft(next);
              if (await savePreferences(next)) { setPage(0); setFeedback('Notification preferences saved.'); setUndo(null); }
              else setPreferenceDraft(null);
            }} />
        </label>)}
      </div>
    </details>
    {feedback && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-text-2"><p>{feedback}</p>{undo && <button type="button" className={buttonClass} disabled={busy} onClick={async () => { if (await act(undo)) { setUndo(null); setFeedback('Action undone.'); setPage(0); } }}>Undo</button>}</div>}
    <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Your notifications">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex rounded-xl bg-surface-muted p-1" aria-label="Filter notifications">
          {FILTERS.map(filter => <button key={filter.value} type="button" aria-pressed={view === filter.value} onClick={() => { setView(filter.value); setPage(0); }} className={`min-h-9 rounded-lg px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${view === filter.value ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'}`}>
            {filter.label}{filter.value !== 'inbox' && data && !error && <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand-dark">{filter.value === 'unread' ? data.unreadCount : data.archivedCount}</span>}
          </button>)}
        </div>
        {view !== 'archived' && <button type="button" className={buttonClass} disabled={busy || !data?.unreadCount || Boolean(error)} onClick={async () => { if (await act({ action: 'mark_all_read' })) { setPage(0); setFeedback('All inbox notifications marked as read.'); setUndo(null); } }}><CheckCheck className="h-4 w-4" /> Mark all read</button>}
      </div>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
        <input aria-label="Search notification titles" placeholder="Search titles…" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} className={`${fieldClass} flex-1`} />
        <select aria-label="Notification category" value={kind} onChange={event => { setKind(event.target.value); setPage(0); }} className={fieldClass}><option value="">All categories</option>{Object.entries(KINDS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
      </div>
      {view === 'archived' && <p className="border-b border-border px-4 py-3 text-xs leading-relaxed text-text-2">Archived updates live here, away from your inbox and unread badge. Restore returns them with their original read status. They still expire on their original date.</p>}
      {inbox && inbox.items.length > 0 && !visibleError && <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <label className="flex min-h-10 items-center gap-2 text-xs text-text-2"><input type="checkbox" aria-label="Select all on this page" checked={selectedIds.length === inbox.items.length} disabled={busy} onChange={event => setSelected(event.target.checked ? inbox.items.map(item => item.id) : [])} className="h-4 w-4 accent-brand" />{selectedIds.length ? `${selectedIds.length} selected` : 'Select page'}</label>
        {selectedIds.length > 0 && (view === 'archived' ? <button className={buttonClass} disabled={busy} onClick={() => void bulk('restore_many')}><ArchiveRestore className="h-4 w-4" /> Restore selected</button> : <><button className={buttonClass} disabled={busy} onClick={() => void bulk('read_many')}>Mark selected read</button><button className={buttonClass} disabled={busy} onClick={() => void bulk('archive_many')}>Archive selected</button></>)}
        {selectedIds.length > 0 && <button type="button" className={buttonClass} disabled={busy} onClick={() => void bulk('delete_many')}><Trash2 className="h-4 w-4" /> Delete selected</button>}
        <span className="ml-auto text-xs text-text-2">{inbox.totalCount} {inbox.totalCount === 1 ? 'update' : 'updates'}</span>
      </div>}
      {visibleError ? <div role="status" className="space-y-3 p-6 text-sm text-text-2"><p>{visibleError}</p><button type="button" className={buttonClass} onClick={() => { setPage(0); void refresh(true); }}>Try again</button></div>
        : loading || !inbox ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-text-2"><RefreshCw className="h-4 w-4 animate-spin" /> Loading your updates…</div>
          : !inbox.items.length ? <div className="p-4 sm:p-6"><EmptyState icon={view === 'archived' ? Archive : view === 'unread' ? CheckCheck : Bell}
            title={query || kind ? 'No matching updates' : view === 'archived' ? 'Nothing archived' : view === 'unread' ? 'You’re all caught up' : 'No updates yet'}
            message={query || kind ? 'Try a different title or category filter.' : view === 'archived' ? 'Archived notifications appear here until they expire. You can restore them before then.' : view === 'unread' ? 'There are no unread updates in your enabled categories.' : 'Save a revision plan or complete a quiz to receive study updates.'} ctaHref={view === 'inbox' && !query && !kind ? '/dashboard/plan' : undefined} ctaLabel="Open your plans" /></div>
            : <ul className="divide-y divide-border">{inbox.items.map(item => {
              const { icon: Icon, label } = KINDS[item.kind];
              return <li key={item.id} className={`flex gap-3 px-4 py-5 sm:gap-4 sm:px-5 ${!item.readAt && !item.archivedAt ? 'bg-brand/5' : ''}`}>
                <input type="checkbox" aria-label={`Select ${item.title}`} checked={selectedIds.includes(item.id)} disabled={busy} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} className="mt-3 h-4 w-4 shrink-0 accent-brand" />
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-brand sm:flex"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-2"><span>{label}</span><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time>{!item.readAt && <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand-dark">Unread</span>}</div>
                  <Link href={item.href} onClick={() => { if (!item.readAt && !item.archivedAt) void act({ action: 'read', id: item.id }); }} className="inline-flex items-start gap-1.5 rounded text-sm font-bold text-navy hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">{item.title}<ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" /></Link>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-2">{item.body}</p>
                  {item.archivedAt && <p className="mt-2 text-xs text-text-2">Archived {timestamp(item.archivedAt)}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!item.archivedAt && <button type="button" className={buttonClass} disabled={busy} onClick={() => void update(item, item.readAt ? 'unread' : 'read')}>{item.readAt ? 'Mark unread' : 'Mark read'}</button>}
                    <button type="button" className={buttonClass} disabled={busy} onClick={() => void update(item, item.archivedAt ? 'restore' : 'archive')}>{item.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}{item.archivedAt ? 'Restore' : 'Archive'}</button>
                    <button type="button" className={buttonClass} disabled={busy} onClick={() => void update(item, 'delete')}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </div>
              </li>;
            })}</ul>}
      {inbox && (page > 0 || inbox.hasMore) && <div className="flex items-center justify-between gap-3 border-t border-border p-4"><button type="button" className={buttonClass} disabled={page === 0 || busy} onClick={() => setPage(value => value - 1)}><ChevronLeft className="h-4 w-4" /> Previous</button><p className="text-xs text-text-2">Page {page + 1}</p><button type="button" className={buttonClass} disabled={!inbox.hasMore || busy} onClick={() => setPage(value => value + 1)}>Next <ChevronRight className="h-4 w-4" /></button></div>}
    </section>
    <p className="text-center text-xs leading-relaxed text-text-2">Study updates stay for up to 30 days, including in Archived. Exam reminders expire at the end of their day. Archiving or restoring never changes your revision plan.</p>
  </div>;
}
