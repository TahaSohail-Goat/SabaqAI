import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildNotificationCandidates, DEFAULT_NOTIFICATION_PREFERENCES, enabledNotificationKinds, notificationDay,
  type AttemptNotificationSource, type PlanNotificationSource,
} from '../src/lib/notifications/rules';
import { applyNotificationAction, notificationActionSchema, notificationPreferencesSchema, notificationQuerySchema } from '../src/lib/notifications/server';
import { fetchNotificationJson } from '../src/components/app/NotificationContext';
import { appendNotificationPopups, collectNotificationPopups } from '../src/lib/notifications/popups';
import type { NotificationInboxResponse, StudyNotification } from '../src/lib/types';

const now = new Date('2026-10-21T10:00:00Z');
const scope = { board: 'FBISE', classLevel: 10, subjects: ['physics'] };
const plan: PlanNotificationSource = {
  id: '00000000-0000-4000-8000-000000000001', board_code: 'FBISE', class_level: 10, subject_code: 'physics',
  from_chapter_no: 1, to_chapter_no: 3, exam_date: '2026-10-22', created_at: '2026-10-20T10:00:00Z',
};
const attempt: AttemptNotificationSource = {
  id: '00000000-0000-4000-8000-000000000002', board_code: 'FBISE', class_level: 10, subject_code: 'physics',
  chapter_no: 2, submitted_at: '2026-10-21T09:00:00Z',
};
const build = (plans = [plan], attempts = [attempt], preferences = DEFAULT_NOTIFICATION_PREFERENCES, time = now) =>
  buildNotificationCandidates(plans, attempts, scope, preferences, time);

test('notifications use Pakistan calendar days at the UTC midnight boundary', () => {
  assert.equal(notificationDay(new Date('2026-10-21T18:59:59Z')), '2026-10-21');
  assert.equal(notificationDay(new Date('2026-10-21T19:00:00Z')), '2026-10-22');
  const messages = build([plan], [], DEFAULT_NOTIFICATION_PREFERENCES, new Date('2026-10-21T19:00:00Z'));
  const reminder = messages.find(item => item.kind === 'exam_reminder');
  assert.equal(reminder?.title, 'Physics exam today');
  assert.equal(reminder?.expires_at, '2026-10-22T19:00:00.000Z');
});

test('exam reminders occur only on the configured calendar days', () => {
  for (const day of [21, 22, 24, 28]) {
    assert.ok(build([{ ...plan, exam_date: `2026-10-${day}` }], []).some(item => item.kind === 'exam_reminder'));
  }
  assert.equal(build([{ ...plan, exam_date: '2026-10-23' }], []).filter(item => item.kind === 'exam_reminder').length, 0);
  assert.equal(build([{ ...plan, exam_date: '2026-10-20' }], []).length, 0);
  assert.equal(build([{ ...plan, exam_date: 'invalid' }], []).length, 0);
});

test('event keys are stable across repeated syncs but separate exam-date changes', () => {
  const first = build();
  const later = build([plan], [attempt], DEFAULT_NOTIFICATION_PREFERENCES, new Date('2026-10-21T11:00:00Z'));
  assert.deepEqual(first.map(item => item.event_key), later.map(item => item.event_key));
  const changed = build([{ ...plan, exam_date: '2026-10-24' }], []);
  assert.notEqual(first[0].event_key, changed[0].event_key);
  assert.equal(first.find(item => item.kind === 'quiz_completed')?.href, `/quiz/history/${attempt.id}`);
  assert.equal(first.find(item => item.kind === 'plan_created')?.href, `/dashboard/plan?plan=${plan.id}`);
});

test('board, class and subject mismatches never produce notifications', () => {
  for (const patch of [{ board_code: 'PCTB' }, { class_level: 9 }, { subject_code: 'chemistry' }]) {
    assert.deepEqual(build([{ ...plan, ...patch }], [{ ...attempt, ...patch }]), []);
  }
});

test('preferences suppress only the chosen categories', () => {
  assert.equal(build().length, 3);
  assert.equal(build([plan], [attempt], { ...DEFAULT_NOTIFICATION_PREFERENCES, examReminders: false }).length, 2);
  const paused = { ...DEFAULT_NOTIFICATION_PREFERENCES, examReminders: false, planUpdates: false, quizResults: false };
  assert.deepEqual(build([plan], [attempt], paused), []);
  assert.deepEqual(enabledNotificationKinds(paused), []);
});

test('inbox filters reject invalid views, unbounded searches and ambiguous archived/unread requests', () => {
  assert.equal(notificationQuerySchema.safeParse({ view: 'archived', kind: 'quiz_completed', q: 'Physics' }).success, true);
  for (const params of [{ offset: '-1' }, { offset: '100000' }, { view: 'deleted' }, { kind: 'unknown' }, { q: 'x'.repeat(101) }, { view: 'archived', unread: 'true' }, { user_id: attempt.id }]) {
    assert.equal(notificationQuerySchema.safeParse(params).success, false);
  }
});

test('bulk actions are bounded and cannot carry forged ownership', () => {
  assert.equal(notificationActionSchema.safeParse({ action: 'restore_many', ids: [attempt.id] }).success, true);
  for (const request of [{ action: 'archive_many', ids: [] }, { action: 'read_many', ids: Array(51).fill(attempt.id) }, { action: 'restore_many', ids: [attempt.id], user_id: plan.id }]) {
    assert.equal(notificationActionSchema.safeParse(request).success, false);
  }
});

test('restore clears only archive state and enforces archived, expiry and ownership filters', async () => {
  const calls: [string, unknown][] = [];
  const query = {
    update(value: unknown) { calls.push(['update', value]); return this; },
    eq(key: string, value: unknown) { calls.push([key, value]); return this; },
    in(key: string, value: unknown) { calls.push([key, value]); return this; },
    gt(key: string) { calls.push(['expiry', key]); return this; },
    is(key: string, value: unknown) { calls.push([key, value]); return this; },
    not(key: string, operator: string, value: unknown) { calls.push([key, [operator, value]]); return this; },
    async select() { return { data: [{ id: attempt.id }], error: null }; },
  };
  const admin = { from: () => query } as unknown as SupabaseClient;
  await applyNotificationAction({ admin, userId: 'owner', scope }, { action: 'restore_many', ids: [attempt.id, attempt.id] });
  assert.deepEqual(calls, [
    ['update', { archived_at: null }], ['user_id', 'owner'], ['board_code', 'FBISE'], ['class_level', 10],
    ['subject_code', ['physics']], ['deleted_at', null], ['expiry', 'expires_at'], ['archived_at', ['is', null]], ['id', [attempt.id]],
  ]);
});

test('deletion scrubs text and retains a tombstone with owner/scope checks across inbox and archive', async () => {
  for (const action of [{ action: 'delete', id: attempt.id }, { action: 'delete_many', ids: [attempt.id] }] as const) {
    const calls: [string, unknown][] = [];
    const query = {
      update(value: unknown) { calls.push(['update', value]); return this; },
      eq(key: string, value: unknown) { calls.push([key, value]); return this; },
      in(key: string, value: unknown) { calls.push([key, value]); return this; },
      is(key: string, value: unknown) { calls.push([key, value]); return this; },
      gt(key: string) { calls.push(['expiry', key]); return this; },
      async select() { return { data: [{ id: attempt.id }], error: null }; },
    };
    const admin = { from: () => query } as unknown as SupabaseClient;
    const request = action.action === 'delete' ? action : { ...action, ids: [...action.ids] };
    await applyNotificationAction({ admin, userId: 'owner', scope }, request);
    const patch = calls[0][1] as { deleted_at: string; title: string; body: string };
    assert.ok(Number.isFinite(Date.parse(patch.deleted_at)));
    assert.equal(patch.title, ''); assert.equal(patch.body, '');
    assert.deepEqual(calls.slice(1), [
      ['user_id', 'owner'], ['board_code', 'FBISE'], ['class_level', 10], ['subject_code', ['physics']],
      ['deleted_at', null], ['expiry', 'expires_at'], ['id', action.action === 'delete' ? attempt.id : [attempt.id]],
    ]);
  }
});

const message: StudyNotification = {
  id: attempt.id, kind: 'quiz_completed', title: 'Physics result', body: 'Your result is saved.', href: `/quiz/history/${attempt.id}`,
  createdAt: '2026-10-20T10:00:00Z', receivedAt: '2026-10-21T10:00:01Z', readAt: null, archivedAt: null,
};
const receipt = (items: StudyNotification[], popups = true): NotificationInboxResponse => ({
  items, unreadCount: items.length, archivedCount: 0, totalCount: items.length, hasMore: false,
  checkedAt: '2026-10-21T10:00:00Z', preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, popups },
});

test('popups suppress initial backlog, repeat delivery, restored old messages and read/archive messages', () => {
  const initial = collectNotificationPopups(receipt([]), null);
  assert.deepEqual(collectNotificationPopups(receipt([message]), null).items, []);
  const incoming = collectNotificationPopups(receipt([message]), initial.cursor);
  assert.deepEqual(incoming.items, [message]);
  assert.deepEqual(collectNotificationPopups(receipt([message]), incoming.cursor).items, []);
  for (const patch of [{ readAt: now.toISOString() }, { archivedAt: now.toISOString() }, { receivedAt: '2026-10-20T10:00:00Z' }]) {
    assert.deepEqual(collectNotificationPopups(receipt([{ ...message, ...patch }]), collectNotificationPopups(receipt([]), null).cursor).items, []);
  }
});

test('disabled popups still record seen receipts and queue keeps at most three unique alerts', () => {
  const initial = collectNotificationPopups(receipt([]), null);
  const disabled = collectNotificationPopups(receipt([message], false), initial.cursor);
  assert.deepEqual(disabled.items, []);
  assert.deepEqual(collectNotificationPopups(receipt([message]), disabled.cursor).items, []);
  const incoming = ['a', 'b', 'c', 'd'].map(id => ({ ...message, id }));
  assert.deepEqual(appendNotificationPopups([incoming[0]], incoming).map(item => item.id), ['b', 'c', 'd']);
});

test('old, future and malformed event timestamps do not generate receipt notifications', () => {
  for (const date of ['2026-09-01T00:00:00Z', '2027-01-01T00:00:00Z', 'invalid']) {
    assert.equal(build([{ ...plan, created_at: date }], []).filter(item => item.kind === 'plan_created').length, 0);
    assert.equal(build([], [{ ...attempt, submitted_at: date }]).length, 0);
  }
});

test('creating notifications does not mutate saved plans or attempts', () => {
  const before = JSON.stringify({ plan, attempt });
  build([Object.freeze(plan)], [Object.freeze(attempt)]);
  assert.equal(JSON.stringify({ plan, attempt }), before);
});

test('request validation rejects forged owners, invalid ids and non-boolean preferences', () => {
  assert.equal(notificationActionSchema.safeParse({ action: 'read', id: attempt.id }).success, true);
  assert.equal(notificationActionSchema.safeParse({ action: 'read', id: attempt.id, user_id: 'another-user' }).success, false);
  assert.equal(notificationActionSchema.safeParse({ action: 'read', id: 'invalid' }).success, false);
  assert.equal(notificationActionSchema.safeParse({ action: 'delete_all' }).success, false);
  assert.equal(notificationPreferencesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES, quizResults: 'false' }).success, false);
  assert.equal(notificationPreferencesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES, userId: attempt.id }).success, false);
});

test('single-item actions enforce owner and curriculum filters, and foreign ids return 404', async () => {
  const filters: [string, unknown][] = [];
  const query = {
    update() { return this; },
    eq(key: string, value: unknown) { filters.push([key, value]); return this; },
    in(key: string, value: unknown) { filters.push([key, value]); return this; },
    is() { return this; }, gt() { return this; },
    async select() { return { data: [], error: null }; },
  };
  const admin = { from: () => query } as unknown as SupabaseClient;
  await assert.rejects(() => applyNotificationAction({ admin, userId: 'owner-id', scope }, { action: 'archive', id: attempt.id }),
    (error: unknown) => error instanceof Error && 'status' in error && error.status === 404);
  assert.deepEqual(filters, [
    ['user_id', 'owner-id'], ['board_code', 'FBISE'], ['class_level', 10], ['subject_code', ['physics']], ['id', attempt.id],
  ]);
});

test('client errors explain network failures, preserve server instructions and respect aborts', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(() => fetchNotificationJson('/api/notifications'), /Check your connection/);
    globalThis.fetch = async () => Response.json({ error: 'Apply migration 0019.' }, { status: 503 });
    await assert.rejects(() => fetchNotificationJson('/api/notifications'), /Apply migration 0019/);
    globalThis.fetch = async () => new Response('<html>upstream error</html>');
    await assert.rejects(() => fetchNotificationJson('/api/notifications'), /unreadable response/);
    globalThis.fetch = async () => { throw new DOMException('Cancelled', 'AbortError'); };
    await assert.rejects(() => fetchNotificationJson('/api/notifications'), (error: unknown) => error instanceof Error && error.name === 'AbortError');
  } finally { globalThis.fetch = original; }
});
