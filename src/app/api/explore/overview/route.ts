// GET /api/explore/overview — a per-subject content summary for the whole board+classLevel in
// one round trip, so /explore can render a "planet" per subject without firing one request per
// subject. Always returns all 9 subject codes, even ones with nothing ingested — same honest
// "never hide an empty category" convention as /api/ask/options and /api/syllabus.
//
// Not sensitive data (same reasoning as those two routes) — no auth required.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { ALL_SUBJECT_CODES } from '@/lib/subjects';
import type { ExploreOverviewResponse, ExploreSubjectSummary } from '@/lib/types';

const DEFAULT_BOARD = 'FBISE';
const DEFAULT_CLASS_LEVEL = 9;

function emptySummaries(): ExploreSubjectSummary[] {
  return ALL_SUBJECT_CODES.map((subjectCode) => ({
    subjectCode,
    chapterCount: 0,
    hasTextbook: false,
    hasModelPaper: false,
  }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const board = searchParams.get('board') || DEFAULT_BOARD;
  const classLevel = Number(searchParams.get('classLevel') || DEFAULT_CLASS_LEVEL);

  const empty: ExploreOverviewResponse = { board, classLevel, subjects: emptySummaries() };

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json(empty);
  }

  const { data, error } = await admin
    .from('chapters')
    .select('subject_code, chapter_no, chapter_sources(source_type)')
    .eq('board_code', board)
    .eq('class_level', classLevel)
    .in('subject_code', ALL_SUBJECT_CODES);

  if (error) {
    console.error('explore/overview query failed:', error.message);
    return NextResponse.json(empty);
  }

  // chapterCount only counts chapters with a real textbook source — a model-paper-only
  // "chapter" (keyed by exam year, e.g. 2025) isn't a book chapter in the sense a student
  // browsing /explore would expect a chapter count to mean.
  const bySubject = new Map<string, { textbookChapterNos: Set<number>; hasModelPaper: boolean }>(
    ALL_SUBJECT_CODES.map((code) => [code, { textbookChapterNos: new Set(), hasModelPaper: false }])
  );

  for (const row of data ?? []) {
    const bucket = bySubject.get(row.subject_code);
    if (!bucket) continue; // defensive: a subject_code outside ALL_SUBJECT_CODES shouldn't occur
    for (const source of row.chapter_sources ?? []) {
      if (source.source_type === 'textbook') bucket.textbookChapterNos.add(row.chapter_no);
      if (source.source_type === 'model_paper') bucket.hasModelPaper = true;
    }
  }

  const subjects: ExploreSubjectSummary[] = ALL_SUBJECT_CODES.map((subjectCode) => {
    const bucket = bySubject.get(subjectCode)!;
    return {
      subjectCode,
      chapterCount: bucket.textbookChapterNos.size,
      hasTextbook: bucket.textbookChapterNos.size > 0,
      hasModelPaper: bucket.hasModelPaper,
    };
  });

  const response: ExploreOverviewResponse = { board, classLevel, subjects };
  return NextResponse.json(response);
}
