import { SUBJECT_LABELS } from '@/lib/subjects';
import type { NotificationKind, NotificationPreferences } from '@/lib/types';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  examReminders: true,
  planUpdates: true,
  quizResults: true,
  popups: true,
};
export const NOTIFICATION_TIME_ZONE = 'Asia/Karachi';
export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_LOOKBACK_DAYS = 14;
const DAY_MS = 86_400_000;

export interface NotificationScope {
  board: string;
  classLevel: number;
  subjects: string[];
}

export interface PlanNotificationSource {
  id: string;
  board_code: string;
  class_level: number;
  subject_code: string;
  from_chapter_no: number;
  to_chapter_no: number;
  exam_date: string;
  created_at: string;
}

export interface AttemptNotificationSource {
  id: string;
  submitted_at: string;
  board_code: string;
  class_level: number;
  subject_code: string;
  chapter_no: number;
}

export interface NotificationCandidate {
  event_key: string;
  kind: NotificationKind;
  board_code: string;
  class_level: number;
  subject_code: string;
  plan_id: string | null;
  attempt_id: string | null;
  title: string;
  body: string;
  href: string;
  created_at: string;
  expires_at: string;
}

export function notificationDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NOTIFICATION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function enabledNotificationKinds(preferences: NotificationPreferences): NotificationKind[] {
  return [
    ...(preferences.examReminders ? ['exam_reminder' as const] : []),
    ...(preferences.planUpdates ? ['plan_created' as const] : []),
    ...(preferences.quizResults ? ['quiz_completed' as const] : []),
  ];
}

export function buildNotificationCandidates(
  plans: PlanNotificationSource[],
  attempts: AttemptNotificationSource[],
  scope: NotificationScope,
  preferences: NotificationPreferences,
  now = new Date(),
): NotificationCandidate[] {
  const today = notificationDay(now);
  const dayStart = new Date(`${today}T00:00:00+05:00`).getTime();
  const recent = now.getTime() - NOTIFICATION_LOOKBACK_DAYS * DAY_MS;
  const inScope = (row: { board_code: string; class_level: number; subject_code: string }) =>
    row.board_code === scope.board && row.class_level === scope.classLevel && scope.subjects.includes(row.subject_code);
  const candidates: NotificationCandidate[] = [];

  for (const plan of plans) {
    if (!inScope(plan)) continue;
    const examTime = Date.parse(`${plan.exam_date}T00:00:00+05:00`);
    const days = Math.round((examTime - dayStart) / DAY_MS);
    if (!Number.isFinite(days) || days < 0) continue;
    const subject = SUBJECT_LABELS[plan.subject_code] ?? plan.subject_code;
    const base = {
      board_code: plan.board_code, class_level: plan.class_level, subject_code: plan.subject_code,
      plan_id: plan.id, attempt_id: null, href: `/dashboard/plan?plan=${encodeURIComponent(plan.id)}`,
    };
    // A dated event key makes repeated syncs idempotent, including after read/archive.
    if (preferences.examReminders && [7, 3, 1, 0].includes(days)) {
      const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      candidates.push({
        ...base, kind: 'exam_reminder', event_key: `exam:${plan.id}:${plan.exam_date}:${days}`,
        title: `${subject} exam ${when}`,
        body: 'Your saved exam date is approaching. Open your revision plan to choose your next step.',
        created_at: now.toISOString(), expires_at: new Date(dayStart + DAY_MS).toISOString(),
      });
    }
    const created = Date.parse(plan.created_at);
    if (preferences.planUpdates && Number.isFinite(created) && created >= recent && created <= now.getTime()) {
      candidates.push({
        ...base, kind: 'plan_created', event_key: `plan:${plan.id}`,
        title: `${subject} revision plan saved`,
        body: `${plan.from_chapter_no === plan.to_chapter_no ? `Chapter ${plan.from_chapter_no}` : `Chapters ${plan.from_chapter_no}–${plan.to_chapter_no}`}. Your plan is available whenever you are ready to study.`,
        created_at: plan.created_at, expires_at: new Date(created + 30 * DAY_MS).toISOString(),
      });
    }
  }

  if (preferences.quizResults) {
    for (const attempt of attempts) {
      const submitted = Date.parse(attempt.submitted_at);
      if (!inScope(attempt) || !Number.isFinite(submitted) || submitted < recent || submitted > now.getTime()) continue;
      const subject = SUBJECT_LABELS[attempt.subject_code] ?? attempt.subject_code;
      candidates.push({
        event_key: `quiz:${attempt.id}`, kind: 'quiz_completed',
        board_code: attempt.board_code, class_level: attempt.class_level, subject_code: attempt.subject_code,
        plan_id: null, attempt_id: attempt.id, title: `${subject} quiz result available`,
        body: `Open your saved Chapter ${attempt.chapter_no} attempt to review the result and feedback.`,
        href: `/quiz/history/${encodeURIComponent(attempt.id)}`,
        created_at: attempt.submitted_at, expires_at: new Date(submitted + 30 * DAY_MS).toISOString(),
      });
    }
  }
  return candidates;
}
