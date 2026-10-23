// GET /api/ask/document — full ingested content of one chapter/paper (not excerpted), for
// the immersive reader on /ask's other half. Same "not sensitive" reasoning as
// /api/syllabus and /api/ask/options — no auth required.

import { NextRequest, NextResponse } from 'next/server';
import { readSourceDocument } from '@/lib/ask/evidence';
import { scopeSchema } from '@/lib/ask/contracts';
import { AskFailure } from '@/lib/ask/config';
import type { AskDocumentResponse, AskSourceType } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const board = searchParams.get('board');
  const classLevel = Number(searchParams.get('classLevel'));
  const subject = searchParams.get('subject')?.toLowerCase();
  const sourceType = searchParams.get('sourceType') as AskSourceType | null;
  const chapterNo = Number(searchParams.get('chapterNo'));

  if (!board || !subject || !sourceType || !Number.isFinite(classLevel) || !Number.isFinite(chapterNo)) {
    return NextResponse.json({ error: 'board, classLevel, subject, sourceType and chapterNo are required.' }, { status: 400 });
  }

  const sourceId = searchParams.get('sourceId');
  const scope = scopeSchema.safeParse({ board, classLevel, subject, sourceType, chapterNo, ...(sourceId ? { sourceId } : {}) });
  if (!scope.success) return NextResponse.json({ error: 'Choose a valid source and chapter.' }, { status: 400 });
  let rows;
  try {
    rows = (await readSourceDocument(scope.data, req.signal)).map((c) => ({ id: c.id, chapter_title: c.chapterTitle,
      section: c.section, page_from: c.pageFrom, page_to: c.pageTo, chunk_index: c.chunkIndex, content: c.content }));
  } catch (error) {
    return NextResponse.json({ error: 'Could not load this source. Select the source and chapter again.' }, { status: error instanceof AskFailure ? error.httpStatus : 503 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nothing ingested for this selection.' }, { status: 404 });
  }

  // Group consecutive rows sharing a section_label into one section, in the order the query
  // already returned them (by page, then chunk_index) — chunks within a section are never
  // reordered.
  const sections: AskDocumentResponse['sections'] = [];
  for (const row of rows) {
    const last = sections[sections.length - 1];
    if (last && last.sectionLabel === row.section && last.pageFrom === row.page_from && last.pageTo === row.page_to) {
      last.chunks.push({ id: row.id, content: row.content });
    } else {
      sections.push({
        sectionLabel: row.section,
        pageFrom: row.page_from,
        pageTo: row.page_to,
        chunks: [{ id: row.id, content: row.content }],
      });
    }
  }

  const response: AskDocumentResponse = {
    chapterNo,
    chapterTitle: rows[0].chapter_title,
    sourceType,
    sections,
  };

  return NextResponse.json(response);
}
