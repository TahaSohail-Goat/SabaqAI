// Revision Planner (M10) detail route — computes the day-by-day schedule fresh on every request
// from *current* mastery (src/lib/mastery.ts), never stored. If a student quizzes mid-plan and a
// chapter moves bands, the remaining days reprioritize automatically instead of going stale.
//
// Deterministic, no LLM (docs/modules.md §11 — a generated plan is unverifiable prose in a
// product whose entire pitch is verifiability). Every item traces back to a real accuracy number
// or "never attempted," and every trimmed chapter is reported, not silently dropped.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { computeChapterMastery, type MasteryBand } from '@/lib/mastery';

export type PlanAction = 'study' | 'quiz' | 'review';

export interface PlanItem {
  chapterNo: number;
  chapterTitle: string | null;
  action: PlanAction;
  band: MasteryBand;
  accuracy: number | null;
  rationale: string;
}

export interface PlanDay {
  date: string;
  isBufferDay: boolean;
  isExamDay: boolean;
  items: PlanItem[];
}

export interface PlanDetail {
  id: string;
  subject: string;
  fromChapterNo: number;
  toChapterNo: number;
  examDate: string;
  daysRemaining: number;
  reserveBufferDay: boolean;
  expired: boolean;
  days: PlanDay[];
  skipped: { chapterNo: number; chapterTitle: string | null; reason: string }[];
}

// Weakest-evidence-first: a confirmed poor score outranks "never attempted" (evidence beats
// absence of evidence), which outranks a thin sample, which outranks partial success, which
// outranks a confirmed strong chapter.
const TIER: Record<MasteryBand, number> = {
  needs_work: 0,
  not_started: 1,
  insufficient_data: 2,
  getting_there: 3,
  strong: 4,
};

const MIN_DAYS_FOR_BUFFER = 4;

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - todayMidnight().getTime()) / (24 * 60 * 60 * 1000));
}

function addDaysIso(offset: number): string {
  const d = todayMidnight();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function pct(accuracy: number | null): string {
  return accuracy === null ? '' : `${Math.round(accuracy * 100)}%`;
}

interface Slot {
  chapterNo: number;
  chapterTitle: string | null;
  band: MasteryBand;
  accuracy: number | null;
  action: PlanAction;
  rationale: string;
}

/** The desired sessions for one chapter, in priority order within the chapter (study before its
 *  first quiz, etc). Weaker chapters get more passes — not just one study-then-quiz, but a
 *  spaced follow-up quiz too — because a single quiz right after studying doesn't test whether
 *  it stuck; a long exam runway is exactly when that follow-up pass is affordable. Strong
 *  chapters stay a single light touch on purpose — more repetition there is wasted effort. */
function sessionsForChapter(chapterNo: number, chapterTitle: string | null, band: MasteryBand, accuracy: number | null): Slot[] {
  const p = pct(accuracy);
  switch (band) {
    case 'needs_work':
      return [
        { chapterNo, chapterTitle, band, accuracy, action: 'study', rationale: `${p} on your last attempt — worth a full re-read before quizzing again.` },
        { chapterNo, chapterTitle, band, accuracy, action: 'quiz', rationale: 'Retake it to confirm the re-study helped.' },
        { chapterNo, chapterTitle, band, accuracy, action: 'quiz', rationale: 'One more spaced retake — this is what makes it stick.' },
      ];
    case 'not_started':
      return [
        { chapterNo, chapterTitle, band, accuracy, action: 'study', rationale: 'Never attempted — start here.' },
        { chapterNo, chapterTitle, band, accuracy, action: 'quiz', rationale: 'First real check on this chapter.' },
        { chapterNo, chapterTitle, band, accuracy, action: 'quiz', rationale: 'A spaced follow-up quiz to lock it in.' },
      ];
    case 'insufficient_data':
      return [
        { chapterNo, chapterTitle, band, accuracy, action: 'study', rationale: 'Only a few questions answered so far — build a fuller picture.' },
        { chapterNo, chapterTitle, band, accuracy, action: 'quiz', rationale: 'A proper first check on this chapter.' },
      ];
    case 'getting_there':
      return [
        { chapterNo, chapterTitle, band, accuracy, action: 'quiz', rationale: `${p} so far — review your mistakes and try again.` },
        { chapterNo, chapterTitle, band, accuracy, action: 'quiz', rationale: 'A spaced review to keep it fresh before the exam.' },
      ];
    case 'strong':
    default:
      return [
        { chapterNo, chapterTitle, band, accuracy, action: 'review', rationale: `${p} already — just a quick refresher.` },
      ];
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();
    if (!user || !admin) {
      return NextResponse.json({ error: 'You need to be logged in to view this plan.' }, { status: 401 });
    }

    const { data: plan, error: planError } = await admin
      .from('exam_plans')
      .select('id, user_id, board_code, class_level, subject_code, from_chapter_no, to_chapter_no, exam_date, reserve_buffer_day')
      .eq('id', id)
      .maybeSingle();

    if (planError || !plan || plan.user_id !== user.id) {
      return NextResponse.json({ error: 'This plan could not be found.' }, { status: 404 });
    }

    const daysRemaining = daysUntil(plan.exam_date);

    if (daysRemaining < 0) {
      return NextResponse.json<PlanDetail>({
        id: plan.id,
        subject: plan.subject_code,
        fromChapterNo: plan.from_chapter_no,
        toChapterNo: plan.to_chapter_no,
        examDate: plan.exam_date,
        daysRemaining,
        reserveBufferDay: plan.reserve_buffer_day,
        expired: true,
        days: [],
        skipped: [],
      });
    }

    const masteryBySubject = await computeChapterMastery(admin, user.id, plan.board_code, plan.class_level, [plan.subject_code]);
    const chaptersInRange = (masteryBySubject[0]?.chapters ?? []).filter(
      (c) => c.chapterNo >= plan.from_chapter_no && c.chapterNo <= plan.to_chapter_no
    );

    // Per-chapter session lists, priority-sorted (weakest chapters first) — each chapter's own
    // sessions stay in order (study before its first quiz, etc).
    const perChapterSessions = chaptersInRange
      .slice()
      .sort((a, b) => TIER[a.band] - TIER[b.band] || a.chapterNo - b.chapterNo)
      .map((c) => sessionsForChapter(c.chapterNo, c.chapterTitle, c.band, c.accuracy));

    // Round-robin, not chapter-by-chapter: take every chapter's 1st session before any chapter's
    // 2nd, etc. This is what actually fixes "long runway, all-at-the-front" scheduling — laying
    // sessions out chapter-by-chapter (all of Ch1's sessions, then all of Ch2's...) is what
    // produces a dense cluster at the start and empty days after, no matter how the days get
    // divided up afterward. Round-robin order also naturally spaces a chapter's own repeat
    // quizzes apart in time, since other chapters' sessions land between them.
    const maxRounds = perChapterSessions.reduce((max, s) => Math.max(max, s.length), 0);
    const allSlots: Slot[] = [];
    for (let round = 0; round < maxRounds; round++) {
      for (const sessions of perChapterSessions) {
        if (sessions[round]) allSlots.push(sessions[round]);
      }
    }

    const bufferApplied = plan.reserve_buffer_day && daysRemaining >= MIN_DAYS_FOR_BUFFER;
    const effectiveDays = Math.max(0, daysRemaining - (bufferApplied ? 1 : 0));

    // Spread evenly across the WHOLE window instead of packing from day one — session i of N
    // lands on day floor(i * effectiveDays / N), so a light workload (few sessions, many days)
    // gets spaced out across the full runway rather than finishing in the first few days and
    // leaving the rest empty (which just invites forgetting what was covered), while a heavy
    // workload (more sessions than days) still lands multiple-per-day and nothing is dropped —
    // same one formula covers both cases. Only a genuine zero-days case (exam is today) has no
    // day to place anything on at all.
    const dayBuckets: Slot[][] = Array.from({ length: effectiveDays }, () => []);
    const totalSlots = allSlots.length;
    if (effectiveDays > 0 && totalSlots > 0) {
      allSlots.forEach((slot, i) => {
        const dayIndex = Math.min(effectiveDays - 1, Math.floor((i * effectiveDays) / totalSlots));
        dayBuckets[dayIndex].push(slot);
      });
    }

    const skipped =
      effectiveDays === 0 && allSlots.length > 0
        ? [...new Map(allSlots.map((s) => [s.chapterNo, { chapterNo: s.chapterNo, chapterTitle: s.chapterTitle }])).values()]
            .sort((a, b) => a.chapterNo - b.chapterNo)
            .map((c) => ({ ...c, reason: "No days remain before the exam to fit this chapter in." }))
        : [];

    const days: PlanDay[] = [];
    for (let offset = 0; offset < effectiveDays; offset++) {
      days.push({ date: addDaysIso(offset), isBufferDay: false, isExamDay: false, items: dayBuckets[offset] });
    }
    if (bufferApplied) {
      days.push({ date: addDaysIso(daysRemaining - 1), isBufferDay: true, isExamDay: false, items: [] });
    }
    days.push({ date: addDaysIso(daysRemaining), isBufferDay: false, isExamDay: true, items: [] });

    return NextResponse.json<PlanDetail>({
      id: plan.id,
      subject: plan.subject_code,
      fromChapterNo: plan.from_chapter_no,
      toChapterNo: plan.to_chapter_no,
      examDate: plan.exam_date,
      daysRemaining,
      reserveBufferDay: plan.reserve_buffer_day,
      expired: false,
      days,
      skipped,
    });
  } catch (error) {
    console.error('Plan detail API error:', error);
    return NextResponse.json({ error: 'Failed to load plan.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();
    if (!user || !admin) {
      return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
    }

    const { error } = await admin.from('exam_plans').delete().eq('id', id).eq('user_id', user.id);
    if (error) {
      console.error('Plan: delete failed:', error.message);
      return NextResponse.json({ error: 'Failed to delete plan.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Plan delete API error:', error);
    return NextResponse.json({ error: 'Failed to delete plan.' }, { status: 500 });
  }
}
