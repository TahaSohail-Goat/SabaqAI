// GET /api/ask/options — what a student can pick from before asking a question: which
// source (book / past papers / model papers) and which specific chapter or paper within
// it. Always returns all three source types, even with an empty units array, so /ask can
// show an honest "nothing ingested yet" state per category instead of hiding it — this
// app refuses rather than guesses, and a dropdown that hides an empty category is a
// milder version of the same dishonesty.
//
// Not sensitive data (same reasoning as /api/syllabus) — no auth required.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getSourcePdfUrl, SOURCE_PDF_BUCKET } from '@/lib/storage/source-pdfs';
import { displayChapterTitle, type AskOptionsResponse, type AskSourceOption, type AskSourceType } from '@/lib/types';

const DEFAULT_BOARD = 'FBISE';
const DEFAULT_CLASS_LEVEL = 10;
const DEFAULT_SUBJECT = 'physics';

const SOURCE_TYPES: AskSourceType[] = ['textbook', 'past_paper', 'model_paper'];
// A database-only restore keeps Storage paths but loses the bytes. In recovery mode, check
// the actual bucket so each restored chapter can show its PDF while missing ones use OCR.
const verifyPdfPresence = process.env.SOURCE_PDF_BYTES_AVAILABLE === 'false';

async function hasPdfBytes(url: string): Promise<boolean> {
  try {
    // Storage listings and HEAD responses survive a database-only restore. Only a GET
    // proves that the backing file exists; read a small prefix rather than a whole book.
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-15' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const reader = response.body?.getReader();
    if (!reader) return false;
    try {
      if (!response.ok) return false;
      const { value } = await reader.read();
      return value !== undefined && new TextDecoder().decode(value.slice(0, 5)) === '%PDF-';
    } finally {
      await reader.cancel();
    }
  } catch {
    return false;
  }
}

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
    .select('chapter_no, chapter_title, chapter_sources(source_type, storage_path, sections(page_from))')
    .eq('board_code', board)
    .eq('class_level', classLevel)
    .eq('subject_code', subject)
    .order('chapter_no', { ascending: true });

  if (error) {
    console.error('ask/options query failed:', error.message);
    return NextResponse.json(empty);
  }

  const storagePrefix = `${board.toLowerCase()}/${classLevel}/${subject}`;
  const availablePdfPaths = new Set<string>();
  if (verifyPdfPresence) {
    const { data: files, error: storageError } = await admin.storage
      .from(SOURCE_PDF_BUCKET)
      .list(storagePrefix, { limit: 1000 });
    if (storageError) {
      console.error('ask/options PDF listing failed:', storageError.message);
    } else {
      const paths = (files ?? []).map((file) => `${storagePrefix}/${file.name}`);
      // Limit recovery probes so a subject with many papers cannot flood Storage.
      for (let offset = 0; offset < paths.length; offset += 4) {
        await Promise.all(paths.slice(offset, offset + 4).map(async (path) => {
          if (await hasPdfBytes(getSourcePdfUrl(admin, path))) availablePdfPaths.add(path);
        }));
      }
    }
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
      // The absolute page (in the original source) that maps to page 1 of this unit's own
      // PDF — see AskUnit.pageFrom. Only textbook chapters carry a real offset (their PDF is
      // a rebuilt excerpt of the full book); other source types' sections have no page_from
      // at all, so this comes back null and the reader treats citation pages as already local.
      const pageNumbers = (source.sections ?? [])
        .map((s: { page_from: number | null }) => s.page_from)
        .filter((p): p is number => p != null);
      units.push({
        chapterNo: row.chapter_no,
        chapterTitle: displayChapterTitle(sourceType, row.chapter_no, row.chapter_title, subject),
        pdfUrl: source.storage_path && (!verifyPdfPresence || availablePdfPaths.has(source.storage_path))
          ? getSourcePdfUrl(admin, source.storage_path)
          : null,
        pageFrom: pageNumbers.length > 0 ? Math.min(...pageNumbers) : null,
      });
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
