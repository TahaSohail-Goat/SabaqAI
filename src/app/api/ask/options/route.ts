// GET /api/ask/options — what a student can pick from before asking a question: which
// source (book / past papers / model papers / marking schemes) and which specific
// chapter or paper within it. Always returns all four source types, even with an empty
// units array, so /ask can show an honest "nothing ingested yet" state per category
// instead of hiding it — this app refuses rather than guesses, and a dropdown that hides
// an empty category is a milder version of the same dishonesty.
//
// Not sensitive data (same reasoning as /api/syllabus) — no auth required.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import type { AskOptionsResponse, AskSourceOption, AskSourceType } from '@/lib/types';

const DEFAULT_BOARD = 'FBISE';
const DEFAULT_CLASS_LEVEL = 10;
const DEFAULT_SUBJECT = 'physics';

const SOURCE_TYPES: AskSourceType[] = ['textbook', 'past_paper', 'model_paper', 'marking_scheme'];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const board = searchParams.get('board') || DEFAULT_BOARD;
  const classLevel = Number(searchParams.get('classLevel') || DEFAULT_CLASS_LEVEL);
  const subject = (searchParams.get('subject') || DEFAULT_SUBJECT).toLowerCase();

  const empty: AskOptionsResponse = {
    board,
    classLevel,
    subject,
    sources: SOURCE_TYPES.map((sourceType) => ({ sourceType, units: [] })),
  };

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json(empty);
  }

  const { data, error } = await admin
    .from('chapters')
    .select('chapter_no, chapter_title, chapter_sources(source_type)')
    .eq('board_code', board)
    .eq('class_level', classLevel)
    .eq('subject_code', subject)
    .order('chapter_no', { ascending: true });

  if (error) {
    console.error('ask/options query failed:', error.message);
    return NextResponse.json(empty);
  }

  const bySourceType = new Map<AskSourceType, AskSourceOption['units']>(
    SOURCE_TYPES.map((sourceType) => [sourceType, []])
  );

  for (const row of data ?? []) {
    const seenForRow = new Set<string>();
    for (const source of row.chapter_sources ?? []) {
      const sourceType = source.source_type as AskSourceType;
      const units = bySourceType.get(sourceType);
      // A chapter can carry both an 'en' and 'ur' source of the same type (see 0001_init.sql's
      // chapter_sources unique constraint) — one entry per chapter is enough for this picker.
      if (!units || seenForRow.has(sourceType)) continue;
      seenForRow.add(sourceType);
      units.push({ chapterNo: row.chapter_no, chapterTitle: row.chapter_title });
    }
  }

  const response: AskOptionsResponse = {
    board,
    classLevel,
    subject,
    sources: SOURCE_TYPES.map((sourceType) => ({ sourceType, units: bySourceType.get(sourceType)! })),
  };

  return NextResponse.json(response);
}
