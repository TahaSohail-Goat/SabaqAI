// Revision Planner (M10) — list + create + delete exam_plans. The actual day-by-day schedule is
// computed on demand by GET /api/dashboard/plan/[id], not here — this route only manages scope
// (subject/chapter range/exam date/buffer-day choice).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export interface PlanSummary {
  id: string;
  subject: string;
  fromChapterNo: number;
  toChapterNo: number;
  examDate: string;
  daysRemaining: number;
  reserveBufferDay: boolean;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export async function GET() {
  try {
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();
    if (!user || !admin) return NextResponse.json<{ plans: PlanSummary[] }>({ plans: [] });

    const { data, error } = await admin
      .from('exam_plans')
      .select('id, subject_code, from_chapter_no, to_chapter_no, exam_date, reserve_buffer_day')
      .eq('user_id', user.id)
      .order('exam_date', { ascending: true });

    if (error) {
      console.error('Plan: list query failed:', error.message);
      return NextResponse.json({ error: 'Failed to load plans.' }, { status: 500 });
    }

    const plans: PlanSummary[] = (data ?? []).map((r) => ({
      id: r.id,
      subject: r.subject_code,
      fromChapterNo: r.from_chapter_no,
      toChapterNo: r.to_chapter_no,
      examDate: r.exam_date,
      daysRemaining: daysUntil(r.exam_date),
      reserveBufferDay: r.reserve_buffer_day,
    }));

    return NextResponse.json<{ plans: PlanSummary[] }>({ plans });
  } catch (error) {
    console.error('Plan list API error:', error);
    return NextResponse.json({ error: 'Failed to load plans.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();
    if (!user || !admin || !profile) {
      return NextResponse.json({ error: 'You need to be logged in to create a plan.' }, { status: 401 });
    }

    const body = await req.json();
    const subject = String(body.subject || '').toLowerCase();
    const fromChapterNo = Number(body.fromChapterNo);
    const toChapterNo = Number(body.toChapterNo);
    const examDate = String(body.examDate || '');
    const reserveBufferDay = body.reserveBufferDay !== false;

    if (!subject || !Number.isInteger(fromChapterNo) || !Number.isInteger(toChapterNo) || toChapterNo < fromChapterNo) {
      return NextResponse.json({ error: 'A subject and a valid chapter range are required.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || daysUntil(examDate) < 1) {
      return NextResponse.json({ error: 'Exam date must be a real date in the future.' }, { status: 400 });
    }

    // Chapters must actually exist as real textbook content in this range — same guard as quiz
    // generation, so a plan can never be built against a range with nothing to study.
    const { data: chapterRows, error: chaptersError } = await admin
      .from('content_chunks_expanded')
      .select('chapter_no')
      .eq('board', profile.board)
      .eq('class_level', profile.classLevel)
      .eq('subject', subject)
      .eq('source_type', 'textbook')
      .gte('chapter_no', fromChapterNo)
      .lte('chapter_no', toChapterNo);

    if (chaptersError) {
      console.error('Plan: chapter range validation failed:', chaptersError.message);
      return NextResponse.json({ error: 'Failed to validate chapter range.' }, { status: 500 });
    }
    const distinctChapters = new Set((chapterRows ?? []).map((r) => r.chapter_no));
    if (distinctChapters.size === 0) {
      return NextResponse.json(
        { error: 'No ingested textbook chapters exist in that range for this subject.' },
        { status: 404 }
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from('exam_plans')
      .insert({
        user_id: user.id,
        board_code: profile.board,
        class_level: profile.classLevel,
        subject_code: subject,
        from_chapter_no: fromChapterNo,
        to_chapter_no: toChapterNo,
        exam_date: examDate,
        reserve_buffer_day: reserveBufferDay,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error('Plan: insert failed:', insertError?.message);
      return NextResponse.json({ error: 'Failed to create plan.' }, { status: 500 });
    }

    return NextResponse.json({ id: inserted.id });
  } catch (error) {
    console.error('Plan create API error:', error);
    return NextResponse.json({ error: 'Failed to create plan.' }, { status: 500 });
  }
}
