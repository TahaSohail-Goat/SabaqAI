// Corpus browser. Reads the ingested chunks from the database when Supabase is configured,
// falling back to the local hardcoded corpus for offline frontend work.

import { NextRequest, NextResponse } from 'next/server';
import { INITIAL_SYLLABUS_CHUNKS, CHAPTER_DIRECTORY } from '@/lib/syllabus-data';
import { getServiceRoleClient } from '@/lib/supabase/admin';

// FBISE is the only board this app actually offers (Settings, signup, the crawler all agree) —
// PCTB was hardcoded here before, which meant nothing the crawler ingests under FBISE could
// ever show up in this endpoint. classLevel/subject stay overridable via query params so this
// can serve whatever the caller's actual scope is, not just one fixed combination.
const DEFAULT_BOARD = 'FBISE';
const DEFAULT_CLASS_LEVEL = 10;
const DEFAULT_SUBJECT = 'physics';
const EXCERPT_CHARS = 200;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const board = searchParams.get('board') || DEFAULT_BOARD;
  const classLevel = Number(searchParams.get('classLevel') || DEFAULT_CLASS_LEVEL);
  const subject = (searchParams.get('subject') || DEFAULT_SUBJECT).toLowerCase();

  const supabase = getServiceRoleClient();

  if (supabase) {
    // content_chunks_expanded is a view flattening the normalised chain (chunks → sections →
    // chapter_sources → chapters) back into the shape this endpoint exposes.
    const { data, error } = await supabase
      .from('content_chunks_expanded')
      .select('id, chapter_no, chapter_title, section, page_from, page_to, source_type, language, content')
      .eq('board', board)
      .eq('class_level', classLevel)
      .eq('subject', subject)
      .order('chapter_no', { ascending: true })
      .order('page_from', { ascending: true });

    if (error) {
      console.error('Syllabus query failed:', error.message);
      return NextResponse.json({ error: 'Failed to load syllabus.' }, { status: 500 });
    }

    const rows = data ?? [];

    // Chapter list derived from what is actually ingested, not a fixed directory — so this can
    // never claim coverage the corpus doesn't have.
    const chapters = [...new Map(
      rows.map((r) => [r.chapter_no, { chapterNo: r.chapter_no, chapterTitle: r.chapter_title, subject }])
    ).values()].sort((a, b) => a.chapterNo - b.chapterNo);

    return NextResponse.json({
      board,
      classLevel,
      subject,
      source: 'database',
      totalChunks: rows.length,
      chapters,
      chunks: rows.map((r) => ({
        id: r.id,
        chapterNo: r.chapter_no,
        chapterTitle: r.chapter_title,
        section: r.section,
        pageFrom: r.page_from,
        pageTo: r.page_to,
        sourceType: r.source_type,
        language: r.language,
        excerpt: r.content.slice(0, EXCERPT_CHARS) + (r.content.length > EXCERPT_CHARS ? '…' : ''),
        contentLength: r.content.length,
      })),
    });
  }

  // Local dev fallback (no Supabase configured) — always PCTB Class 10 Physics, since that's
  // the only board/class this hand-written stub corpus covers, regardless of what was asked for.
  return NextResponse.json({
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    source: 'local-fallback',
    totalChunks: INITIAL_SYLLABUS_CHUNKS.length,
    chapters: CHAPTER_DIRECTORY,
    chunks: INITIAL_SYLLABUS_CHUNKS.map((c) => ({
      id: c.id,
      chapterNo: c.chapterNo,
      chapterTitle: c.chapterTitle,
      section: c.section,
      pageFrom: c.pageFrom,
      pageTo: c.pageTo,
      sourceType: c.sourceType,
      language: c.language,
      excerpt: c.content.slice(0, EXCERPT_CHARS) + '…',
      contentLength: c.content.length,
    })),
  });
}
