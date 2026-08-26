import { NextResponse } from 'next/server';
import { INITIAL_SYLLABUS_CHUNKS, CHAPTER_DIRECTORY } from '@/lib/syllabus-data';

export async function GET() {
  return NextResponse.json({
    board: 'PCTB',
    classLevel: 10,
    subject: 'Physics',
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
      excerpt: c.content.slice(0, 200) + '...',
      contentLength: c.content.length,
    })),
  });
}
