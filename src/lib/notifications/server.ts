import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import type { NotificationInboxResponse, NotificationKind, NotificationPreferences } from '@/lib/types';
import {
  buildNotificationCandidates, DEFAULT_NOTIFICATION_PREFERENCES, enabledNotificationKinds,
  notificationDay, NOTIFICATION_LOOKBACK_DAYS, NOTIFICATION_PAGE_SIZE,
  type AttemptNotificationSource, type NotificationScope, type PlanNotificationSource,
} from './rules';

export const notificationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_all_read') }).strict(),
  z.object({ action: z.enum(['read', 'unread', 'archive', 'restore', 'delete']), id: z.uuid() }).strict(),
  z.object({ action: z.enum(['archive_many', 'restore_many', 'read_many', 'delete_many']), ids: z.array(z.uuid()).min(1).max(50) }).strict(),
]);
export const notificationPreferencesSchema = z.object({
  examReminders: z.boolean(), planUpdates: z.boolean(), quizResults: z.boolean(), popups: z.boolean(),
}).strict();

export const notificationQuerySchema = z.object({
  offset: z.string().regex(/^\d{1,5}$/).default('0').transform(Number),
  unread: z.enum(['true', 'false']).optional(),
  view: z.enum(['inbox', 'unread', 'archived']).default('inbox'),
  kind: z.enum(['exam_reminder', 'plan_created', 'quiz_completed']).optional(),
  q: z.string().trim().max(100).default(''),
}).strict().refine(value => !(value.view === 'archived' && value.unread === 'true'), 'Archived and unread filters cannot be combined.');
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

interface NotificationContext {
  admin: SupabaseClient;
  userId: string;
  scope: NotificationScope;
}

export class NotificationError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

export async function notificationContext(): Promise<NotificationContext> {
  const { user, profile, configured } = await getCurrentUserAndProfile({ refreshActivity: false });
  if (!configured) throw new NotificationError('Notifications need Supabase configuration. See docs/notifications-plan.md.');
  if (!user) throw new NotificationError('Sign in to view your notifications.', 401);
  if (!profile) throw new NotificationError('Complete onboarding to use notifications.', 403);
  const admin = getServiceRoleClient();
  if (!admin) throw new NotificationError('Notifications are unavailable. See docs/notifications-plan.md for setup.');
  return { admin, userId: user.id, scope: { board: profile.board, classLevel: profile.classLevel, subjects: profile.subjects } };
}

function databaseError(error: { code?: string; message: string }): never {
  console.error('Notifications database error:', error.code, error.message);
  if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error.code ?? '')) {
    throw new NotificationError('Notifications need database migrations 0019–0021. See docs/notifications-plan.md.');
  }
  throw new NotificationError('Notifications could not be updated. Try again shortly. See docs/notifications-plan.md if this continues.');
}

export function notificationErrorResponse(error: unknown) {
  if (error instanceof NotificationError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Send a valid JSON request.' }, { status: 400 });
  console.error('Notifications request failed:', error);
  return NextResponse.json({ error: 'Notifications are unavailable. Try again shortly.' }, { status: 503 });
}

export async function readNotificationPreferences({ admin, userId }: NotificationContext): Promise<NotificationPreferences> {
  const { data, error } = await admin.from('notification_preferences')
    .select('exam_reminders, plan_updates, quiz_results, popups').eq('user_id', userId).maybeSingle();
  if (error) databaseError(error);
  return data ? {
    examReminders: data.exam_reminders, planUpdates: data.plan_updates, quizResults: data.quiz_results, popups: data.popups,
  } : { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

export async function saveNotificationPreferences(context: NotificationContext, preferences: NotificationPreferences) {
  const { error } = await context.admin.from('notification_preferences').upsert({
    user_id: context.userId, exam_reminders: preferences.examReminders,
    plan_updates: preferences.planUpdates, quiz_results: preferences.quizResults, popups: preferences.popups,
  }, { onConflict: 'user_id' });
  if (error) databaseError(error);
}

function inboxQuery(context: NotificationContext, kinds: NotificationKind[], now: string, head = false) {
  return context.admin.from('notifications')
    .select('id, kind, title, body, href, created_at, read_at, archived_at, received_at', { count: 'exact', head })
    .eq('user_id', context.userId).eq('board_code', context.scope.board).eq('class_level', context.scope.classLevel)
    .in('subject_code', context.scope.subjects).in('kind', kinds)
    .is('deleted_at', null).gt('expires_at', now);
}

export async function readNotificationInbox(context: NotificationContext, options: NotificationQuery): Promise<NotificationInboxResponse> {
  const { offset, view, q, kind } = options;
  const unreadOnly = view === 'unread' || options.unread === 'true';
  const preferences = await readNotificationPreferences(context);
  // The archive remains accessible even when its category is disabled.
  const kinds: NotificationKind[] = view === 'archived' ? ['exam_reminder', 'plan_created', 'quiz_completed'] : enabledNotificationKinds(preferences);
  const now = new Date().toISOString();
  if (!kinds.length || !context.scope.subjects.length) {
    // Still count archived messages when all live categories are disabled.
    const archive = context.scope.subjects.length ? await inboxQuery(context, ['exam_reminder', 'plan_created', 'quiz_completed'], now, true).not('archived_at', 'is', null) : null;
    if (archive?.error) databaseError(archive.error);
    return { items: [], unreadCount: 0, archivedCount: archive?.count ?? 0, checkedAt: now, totalCount: 0, hasMore: false, preferences };
  }
  let listQuery = inboxQuery(context, kinds, now);
  listQuery = view === 'archived' ? listQuery.not('archived_at', 'is', null) : listQuery.is('archived_at', null);
  if (unreadOnly) listQuery = listQuery.is('read_at', null);
  if (kind) listQuery = listQuery.eq('kind', kind);
  // Literal substring search; never interpolate user text into a PostgREST .or expression.
  if (q) listQuery = listQuery.ilike('title', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
  const activeKinds = enabledNotificationKinds(preferences);
  const [list, unread, archive] = await Promise.all([
    listQuery.order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + NOTIFICATION_PAGE_SIZE - 1),
    activeKinds.length ? inboxQuery(context, activeKinds, now, true).is('archived_at', null).is('read_at', null) : Promise.resolve({ count: 0, error: null }),
    inboxQuery(context, ['exam_reminder', 'plan_created', 'quiz_completed'], now, true).not('archived_at', 'is', null),
  ]);
  if (list.error) databaseError(list.error);
  if (unread.error) databaseError(unread.error);
  if (archive.error) databaseError(archive.error);
  return {
    items: (list.data ?? []).map(row => ({
      id: row.id, kind: row.kind as NotificationKind, title: row.title, body: row.body,
      // Stored destinations are constrained to app routes by the migration.
      href: row.href, createdAt: row.created_at, readAt: row.read_at, archivedAt: row.archived_at, receivedAt: row.received_at,
    })),
    unreadCount: unread.count ?? 0, archivedCount: archive.count ?? 0, checkedAt: now, totalCount: list.count ?? 0,
    hasMore: offset + NOTIFICATION_PAGE_SIZE < (list.count ?? 0), preferences,
  };
}

interface JoinedChapter { board_code: string; class_level: number; subject_code: string; chapter_no: number }
interface JoinedAttempt {
  id: string;
  submitted_at: string;
  quizzes: { chapters: JoinedChapter | JoinedChapter[] } | { chapters: JoinedChapter | JoinedChapter[] }[];
}

export async function syncNotifications(context: NotificationContext) {
  const preferences = await readNotificationPreferences(context);
  if (!context.scope.subjects.length || !enabledNotificationKinds(preferences).length) return;
  const now = new Date();
  const cutoff = new Date(now.getTime() - NOTIFICATION_LOOKBACK_DAYS * 86_400_000).toISOString();
  const [plans, attempts] = await Promise.all([
    context.admin.from('exam_plans')
      .select('id, board_code, class_level, subject_code, from_chapter_no, to_chapter_no, exam_date, created_at')
      .eq('user_id', context.userId).eq('board_code', context.scope.board).eq('class_level', context.scope.classLevel)
      .in('subject_code', context.scope.subjects).gte('exam_date', notificationDay(now))
      .order('exam_date', { ascending: true }).limit(100),
    context.admin.from('quiz_attempts')
      .select('id, submitted_at, quizzes!inner(chapters!inner(board_code, class_level, subject_code, chapter_no))')
      .eq('user_id', context.userId).eq('quizzes.chapters.board_code', context.scope.board)
      .eq('quizzes.chapters.class_level', context.scope.classLevel)
      .in('quizzes.chapters.subject_code', context.scope.subjects)
      .gte('submitted_at', cutoff).order('submitted_at', { ascending: false }).limit(50),
  ]);
  if (plans.error) databaseError(plans.error);
  if (attempts.error) databaseError(attempts.error);
  const attemptSources: AttemptNotificationSource[] = [];
  for (const row of (attempts.data ?? []) as unknown as JoinedAttempt[]) {
    const quiz = Array.isArray(row.quizzes) ? row.quizzes[0] : row.quizzes;
    const chapter = quiz && (Array.isArray(quiz.chapters) ? quiz.chapters[0] : quiz.chapters);
    if (chapter) attemptSources.push({ id: row.id, submitted_at: row.submitted_at, ...chapter });
  }
  const candidates = buildNotificationCandidates(
    (plans.data ?? []) as PlanNotificationSource[], attemptSources, context.scope, preferences, now,
  );
  if (candidates.length) {
    // Never overwrite read/archive state when a second tab or later sync finds the same event.
    const { error } = await context.admin.from('notifications').upsert(
      candidates.map(candidate => ({ ...candidate, user_id: context.userId })),
      { onConflict: 'user_id,event_key', ignoreDuplicates: true },
    );
    if (error) databaseError(error);
  }
}

export async function applyNotificationAction(context: NotificationContext, action: z.infer<typeof notificationActionSchema>) {
  const now = new Date().toISOString();
  const restore = action.action === 'restore' || action.action === 'restore_many';
  const remove = action.action === 'delete' || action.action === 'delete_many';
  // Retain the event key so sync cannot recreate a deleted update. Remove its display text.
  const patch = remove ? { deleted_at: now, title: '', body: '' } : restore ? { archived_at: null } : action.action === 'archive' || action.action === 'archive_many' ? { archived_at: now }
    : { read_at: action.action === 'unread' ? null : now };
  let query = context.admin.from('notifications').update(patch)
    .eq('user_id', context.userId).eq('board_code', context.scope.board).eq('class_level', context.scope.classLevel)
    .in('subject_code', context.scope.subjects).is('deleted_at', null).gt('expires_at', now);
  if (!remove) query = restore ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (action.action === 'mark_all_read') {
    const kinds = enabledNotificationKinds(await readNotificationPreferences(context));
    if (!kinds.length || !context.scope.subjects.length) return;
    query = query.in('kind', kinds).is('read_at', null);
  } else if ('ids' in action) {
    query = query.in('id', [...new Set(action.ids)]);
  } else {
    query = query.eq('id', action.id);
  }
  const { data, error } = await query.select('id');
  if (error) databaseError(error);
  if (action.action !== 'mark_all_read' && !data?.length) throw new NotificationError('This notification is no longer available.', 404);
}
