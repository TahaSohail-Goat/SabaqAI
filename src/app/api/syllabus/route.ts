// Corpus browser. Reads the ingested chunks from the database when Supabase is configured,
// falling back to the local hardcoded corpus for offline frontend work.

import { NextResponse } from 'next/server';
import { INITIAL_SYLLABUS_CHUNKS, CHAPTER_DIRECTORY } from '@/lib/syllabus-data';
import { getServiceRoleClient } from '@/lib/supabase/admin';

const BOARD = 'PCTB';
const CLASS_LEVEL = 10;
const SUBJECT = 'physics';
const EXCERPT_CHARS = 200;

export async function GET() {
  const supabase = getServiceRoleClient();

  if (supabase) {
    const { data, error } = await supabase
      .from('content_chunks')
      .select('id, chapter_no, chapter_title, section, page_from, page_to, source_type, language, content')
      .eq('board', BOARD)
      .eq('class_level', CLASS_LEVEL)
      .eq('subject', SUBJECT)
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
      rows.map((r) => [r.chapter_no, { chapterNo: r.chapter_no, chapterTitle: r.chapter_title, subject: SUBJECT }])
    ).values()].sort((a, b) => a.chapterNo - b.chapterNo);

    return NextResponse.json({
      board: BOARD,
      classLevel: CLASS_LEVEL,
      subject: 'Physics',
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

  return NextResponse.json({
    board: BOARD,
    classLevel: CLASS_LEVEL,
    subject: 'Physics',
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
