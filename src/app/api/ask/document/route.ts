// GET /api/ask/document — full ingested content of one chapter/paper (not excerpted), for
// the immersive reader on /ask's other half. Same "not sensitive" reasoning as
// /api/syllabus and /api/ask/options — no auth required.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
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

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server is not configured for this yet.' }, { status: 500 });
  }

  const { data, error } = await admin
    .from('content_chunks_expanded')
    .select('id, chapter_title, section, page_from, page_to, chunk_index, content')
    .eq('board', board)
    .eq('class_level', classLevel)
    .eq('subject', subject)
    .eq('source_type', sourceType)
    .eq('chapter_no', chapterNo)
    .order('page_from', { ascending: true, nullsFirst: true })
    .order('chunk_index', { ascending: true });

  if (error) {
    console.error('ask/document query failed:', error.message);
    return NextResponse.json({ error: 'Failed to load this document.' }, { status: 500 });
  }

  const rows = data ?? [];
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
