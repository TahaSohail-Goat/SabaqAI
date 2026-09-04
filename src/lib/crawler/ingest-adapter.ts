// The boundary between the crawler and the DB: validates a document's sourceType/language
// against the app's real known-good values BEFORE any embedding-API call is made (matching
// scripts/ingest.ts's existing "fail before spending quota" philosophy — neither the old
// crawler nor ingest.ts actually did this for sourceType/language specifically; an invalid
// value was only ever caught by a raw Postgres FK-violation mid-transaction), resets a
// specific chapter's specific source before re-ingesting it (so a redo replaces old content
// instead of accumulating duplicates alongside it), and wraps the embed + ingest_document call.

import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkDocument, type SourceDocument, type PreparedDocument } from '../ingest/chunker';
import { embedTexts } from '../ai/embeddings';
import type { AskSourceType, CrawlerLanguage } from './types';

const VALID_SOURCE_TYPES: AskSourceType[] = ['textbook', 'past_paper', 'model_paper', 'marking_scheme'];
const VALID_LANGUAGES: CrawlerLanguage[] = ['en', 'ur'];

export class InvalidDocumentError extends Error {}

/** Fails fast on a shape/value problem, before any embedding API call is ever made — the
 *  same reason scripts/ingest.ts already validates presence of required fields, extended
 *  here to also check sourceType/language against the actual known-good values instead of
 *  letting a typo surface as an opaque Postgres FK-violation deep inside a transaction. */
export function validateDocumentShape(doc: SourceDocument): void {
  const missing: string[] = [];
  if (!doc.board) missing.push('board');
  if (typeof doc.classLevel !== 'number') missing.push('classLevel');
  if (!doc.subject) missing.push('subject');
  if (typeof doc.chapterNo !== 'number') missing.push('chapterNo');
  if (!doc.chapterTitle) missing.push('chapterTitle');
  if (!Array.isArray(doc.sections) || doc.sections.length === 0) missing.push('sections');
  if (missing.length > 0) {
    throw new InvalidDocumentError(`Document is missing required field(s): ${missing.join(', ')}`);
  }

  if (!VALID_SOURCE_TYPES.includes(doc.sourceType)) {
    throw new InvalidDocumentError(
      `sourceType "${doc.sourceType}" is not one of the known-good values: ${VALID_SOURCE_TYPES.join(', ')}.`
    );
  }
  if (!VALID_LANGUAGES.includes(doc.language as CrawlerLanguage)) {
    throw new InvalidDocumentError(
      `language "${doc.language}" is not one of the known-good values: ${VALID_LANGUAGES.join(', ')}.`
    );
  }

  doc.sections.forEach((section, i) => {
    if (!section.section) throw new InvalidDocumentError(`sections[${i}] has no "section" label.`);
    if (!section.content?.trim()) throw new InvalidDocumentError(`sections[${i}] has empty content.`);
  });
}

/** Deletes one chapter's specific (sourceType, language) source before re-ingesting it —
 *  cascades through sections -> content_chunks -> qa_log_chunks. Never touches `chapters`,
 *  `quizzes`, or `qa_log` themselves; only the specific source's own sections/chunks. A
 *  no-op if the chapter or that source doesn't exist yet (nothing to reset). */
export async function resetChapterSource(
  admin: SupabaseClient,
  params: { board: string; classLevel: number; subject: string; chapterNo: number; sourceType: string; language: string }
): Promise<{ reset: boolean }> {
  const { data: chapter, error: chapterError } = await admin
    .from('chapters')
    .select('id')
    .eq('board_code', params.board)
    .eq('class_level', params.classLevel)
    .eq('subject_code', params.subject)
    .eq('chapter_no', params.chapterNo)
    .maybeSingle();

  if (chapterError) throw new Error(`resetChapterSource: chapter lookup failed: ${chapterError.message}`);
  if (!chapter) return { reset: false };

  const { error: deleteError } = await admin
    .from('chapter_sources')
    .delete()
    .eq('chapter_id', chapter.id)
    .eq('source_type', params.sourceType)
    .eq('language_code', params.language);

  if (deleteError) throw new Error(`resetChapterSource: delete failed: ${deleteError.message}`);
  return { reset: true };
}

export interface IngestResult {
  chapterId: string;
  chunksReceived: number;
  chunksWritten: number;
}

/** Chunks, embeds, and writes one document through the ingest_document RPC — the same
 *  atomic, idempotent-by-content-hash contract scripts/ingest.ts already uses. Validates the
 *  document's shape first (see validateDocumentShape). */
export async function ingestDocument(
  admin: SupabaseClient,
  doc: SourceDocument,
  options: { force?: boolean; embedRetry?: { maxAttempts: number; baseDelayMs: number } } = {}
): Promise<IngestResult> {
  validateDocumentShape(doc);

  const chunked: PreparedDocument = chunkDocument(doc);
  const flat = chunked.sections.flatMap((s) => s.chunks);
  if (flat.length === 0) {
    throw new InvalidDocumentError('Document produced zero chunks after chunking — nothing to ingest.');
  }

  const vectors = await embedTexts(flat.map((c) => c.content), { retry: options.embedRetry });

  let cursor = 0;
  const payload = {
    board: chunked.board,
    classLevel: chunked.classLevel,
    subject: chunked.subject,
    chapterNo: chunked.chapterNo,
    chapterTitle: chunked.chapterTitle,
    sourceType: chunked.sourceType,
    language: chunked.language,
    sections: chunked.sections.map((s) => ({
      section: s.section,
      position: s.position,
      pageFrom: s.pageFrom,
      pageTo: s.pageTo,
      chunks: s.chunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
        contentHash: c.contentHash,
        embedding: vectors[cursor++],
      })),
    })),
  };

  const { data, error } = await admin.rpc('ingest_document', { payload, p_force: options.force ?? false });
  if (error) {
    throw new Error(
      `ingest_document failed for chapter ${chunked.chapterNo} (${chunked.subject}, ${chunked.sourceType}): ${error.message}`
    );
  }

  const result = data as { chapterId?: string; chunksReceived?: number; chunksWritten?: number } | null;
  return {
    chapterId: result?.chapterId ?? '',
    chunksReceived: result?.chunksReceived ?? flat.length,
    chunksWritten: result?.chunksWritten ?? 0,
  };
}
