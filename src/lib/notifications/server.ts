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
  z.object({ action: z.enum(['read', 'unread', 'archive']), id: z.uuid() }).strict(),
]);
export const notificationPreferencesSchema = z.object({
  examReminders: z.boolean(), planUpdates: z.boolean(), quizResults: z.boolean(),
}).strict();

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
  if (error.code === '42P01' || error.code === 'PGRST205') {
    throw new NotificationError('Notifications need database migration 0019. See docs/notifications-plan.md.');
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
    .select('exam_reminders, plan_updates, quiz_results').eq('user_id', userId).maybeSingle();
  if (error) databaseError(error);
  return data ? {
    examReminders: data.exam_reminders, planUpdates: data.plan_updates, quizResults: data.quiz_results,
  } : { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

export async function saveNotificationPreferences(context: NotificationContext, preferences: NotificationPreferences) {
  const { error } = await context.admin.from('notification_preferences').upsert({
    user_id: context.userId, exam_reminders: preferences.examReminders,
    plan_updates: preferences.planUpdates, quiz_results: preferences.quizResults,
  }, { onConflict: 'user_id' });
  if (error) databaseError(error);
}

function inboxQuery(context: NotificationContext, kinds: NotificationKind[], now: string, head = false) {
  return context.admin.from('notifications')
    .select('id, kind, title, body, href, created_at, read_at', { count: 'exact', head })
    .eq('user_id', context.userId).eq('board_code', context.scope.board).eq('class_level', context.scope.classLevel)
    .in('subject_code', context.scope.subjects).in('kind', kinds)
    .is('archived_at', null).gt('expires_at', now);
}

export async function readNotificationInbox(context: NotificationContext, offset = 0, unreadOnly = false): Promise<NotificationInboxResponse> {
  const preferences = await readNotificationPreferences(context);
  const kinds = enabledNotificationKinds(preferences);
  if (!kinds.length || !context.scope.subjects.length) {
    return { items: [], unreadCount: 0, totalCount: 0, hasMore: false, preferences };
  }
  const now = new Date().toISOString();
  let listQuery = inboxQuery(context, kinds, now);
  if (unreadOnly) listQuery = listQuery.is('read_at', null);
  const [list, unread] = await Promise.all([
    listQuery.order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + NOTIFICATION_PAGE_SIZE - 1),
    inboxQuery(context, kinds, now, true).is('read_at', null),
  ]);
  if (list.error) databaseError(list.error);
  if (unread.error) databaseError(unread.error);
  return {
    items: (list.data ?? []).map(row => ({
      id: row.id, kind: row.kind as NotificationKind, title: row.title, body: row.body,
      // Stored destinations are constrained to app routes by the migration.
      href: row.href, createdAt: row.created_at, readAt: row.read_at,
    })),
    unreadCount: unread.count ?? 0, totalCount: list.count ?? 0,
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
  const patch = action.action === 'archive' ? { archived_at: now }
    : { read_at: action.action === 'unread' ? null : now };
  let query = context.admin.from('notifications').update(patch)
    .eq('user_id', context.userId).eq('board_code', context.scope.board).eq('class_level', context.scope.classLevel)
    .in('subject_code', context.scope.subjects).is('archived_at', null).gt('expires_at', now);
  if (action.action === 'mark_all_read') {
    const kinds = enabledNotificationKinds(await readNotificationPreferences(context));
    if (!kinds.length || !context.scope.subjects.length) return;
    query = query.in('kind', kinds).is('read_at', null);
  } else {
    query = query.eq('id', action.id);
  }
  const { data, error } = await query.select('id');
  if (error) databaseError(error);
  if (action.action !== 'mark_all_read' && !data?.length) throw new NotificationError('This notification is no longer available.', 404);
}
