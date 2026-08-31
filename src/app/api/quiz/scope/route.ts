// Chapter picker for the dynamic quiz module — self-contained so Quiz never depends on
// /api/syllabus (that route/page is a separate module being actively reworked for PDF display;
// coupling Quiz to its response shape would just create merge conflicts for no benefit, since
// Quiz only ever needed a small slice of the same underlying view anyway).

import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

const DEFAULT_BOARD = 'FBISE';
const DEFAULT_CLASS_LEVEL = 10;
const DEFAULT_SUBJECT = 'physics';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const board = searchParams.get('board') || DEFAULT_BOARD;
  const classLevel = Number(searchParams.get('classLevel') || DEFAULT_CLASS_LEVEL);
  const subject = (searchParams.get('subject') || DEFAULT_SUBJECT).toLowerCase();

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ board, classLevel, subject, chapters: [] });
  }

  // Quizzes are only ever grounded in real textbook prose — a subject/class with only a
  // model_paper or past_paper ingested (most of the corpus right now: only class 9
  // biology/chemistry/mathematics/physics and class 10 mathematics have real textbook chapters)
  // must show NO chapters, not a fake "Chapter 2025: Model Paper 2025" entry standing in for
  // one. Filtering here at the source is what keeps that fake entry from ever reaching the UI.
  const { data, error } = await admin
    .from('content_chunks_expanded')
    .select('chapter_no, chapter_title')
    .eq('board', board)
    .eq('class_level', classLevel)
    .eq('subject', subject)
    .eq('source_type', 'textbook');

  if (error) {
    console.error('Quiz scope query failed:', error.message);
    return NextResponse.json({ error: 'Failed to load quiz scope.' }, { status: 500 });
  }

  const rows = data ?? [];

  const chapters = [...new Map(
    rows.map((r) => [r.chapter_no, { chapterNo: r.chapter_no, chapterTitle: r.chapter_title }])
  ).values()].sort((a, b) => a.chapterNo - b.chapterNo);

  return NextResponse.json({ board, classLevel, subject, chapters });
}
