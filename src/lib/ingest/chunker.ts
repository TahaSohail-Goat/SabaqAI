// Recursive character chunking.
//
// Splits on the largest structural boundary that fits, and only falls back to finer ones when a
// piece is still too big: paragraphs → lines → sentences → words → characters. This keeps whole
// paragraphs and sentences intact wherever possible, which matters here because every chunk has
// to stand alone as a citable passage a student can check against their book.
//
// Chunking runs per SECTION, so a chunk can never cross a chapter boundary. A citation that spans
// two chapters points nowhere specific, which defeats the point of citing at all.
// See docs/rag-architecture.md.

import { createHash } from 'node:crypto';

export interface ChunkOptions {
  /** Target maximum characters per chunk. ~2400 chars ≈ 400 words. */
  chunkSize?: number;
  /** Characters of trailing context repeated into the next chunk, so meaning isn't cut mid-idea. */
  chunkOverlap?: number;
  /** Boundaries tried in order, largest structure first. */
  separators?: string[];
}

const DEFAULT_CHUNK_SIZE = 2400;
const DEFAULT_CHUNK_OVERLAP = 240;
const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', '، ', ' ', ''];

export interface SourceSection {
  /** e.g. "14.3 Ohm's Law and Resistance" */
  section: string;
  pageFrom?: number;
  pageTo?: number;
  content: string;
}

export interface SourceDocument {
  board: string;
  classLevel: number;
  subject: string;
  chapterNo: number;
  chapterTitle: string;
  sourceType: 'textbook' | 'past_paper' | 'marking_scheme';
  language: 'en' | 'ur';
  sections: SourceSection[];
}

/** One row destined for `content_chunks`. Column names match the migration. */
export interface PreparedChunk {
  board: string;
  class_level: number;
  subject: string;
  chapter_no: number;
  chapter_title: string;
  section: string;
  page_from: number | null;
  page_to: number | null;
  source_type: 'textbook' | 'past_paper' | 'marking_scheme';
  language: 'en' | 'ur';
  content: string;
  content_hash: string;
}

/**
 * Split text into chunks, preferring the largest structural boundary that fits.
 * Pure and synchronous — no I/O, no model calls. Safe to unit test.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
  const separators = options.separators ?? DEFAULT_SEPARATORS;

  if (chunkSize <= 0) throw new Error('chunkSize must be greater than 0');
  if (chunkOverlap >= chunkSize) {
    throw new Error(`chunkOverlap (${chunkOverlap}) must be smaller than chunkSize (${chunkSize})`);
  }

  const normalised = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!normalised) return [];

  const pieces = splitRecursive(normalised, separators, chunkSize);
  return mergePieces(pieces, chunkSize, chunkOverlap);
}

/**
 * Break text into atomic pieces, each at most `chunkSize` characters.
 * Recurses to a finer separator only for the pieces that are still too long.
 */
function splitRecursive(text: string, separators: string[], chunkSize: number): string[] {
  if (text.length <= chunkSize) {
    return text.trim() ? [text] : [];
  }

  const [separator, ...remaining] = separators;

  // Out of separators, or the last resort: hard-split on character count.
  if (separator === undefined || separator === '') {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      const slice = text.slice(i, i + chunkSize);
      if (slice.trim()) out.push(slice);
    }
    return out;
  }

  if (!text.includes(separator)) {
    return splitRecursive(text, remaining, chunkSize);
  }

  const parts = text.split(separator);
  const out: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    // Re-attach the separator so sentences and paragraphs stay readable.
    const part = i < parts.length - 1 ? parts[i] + separator : parts[i];
    if (!part.trim()) continue;

    if (part.length <= chunkSize) {
      out.push(part);
    } else {
      out.push(...splitRecursive(part, remaining, chunkSize));
    }
  }

  return out;
}

/** Greedily pack pieces up to chunkSize, carrying a word-aligned overlap between chunks. */
function mergePieces(pieces: string[], chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const piece of pieces) {
    const candidate = current ? joinPieces(current, piece) : piece;

    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }

    if (current.trim()) chunks.push(current.trim());

    const carried = overlap > 0 ? tailOverlap(current, overlap) : '';
    const seeded = carried ? joinPieces(carried, piece) : piece;
    // A single piece never exceeds chunkSize (splitRecursive guarantees it), but the carried
    // overlap can push it over. Drop the overlap rather than emit an oversized chunk.
    current = seeded.length <= chunkSize ? seeded : piece;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function joinPieces(left: string, right: string): string {
  return /[\s\n]$/.test(left) ? left + right : `${left} ${right}`;
}

/** Last `overlap` characters, snapped forward to a word boundary so we don't start mid-word. */
function tailOverlap(text: string, overlap: number): string {
  if (text.length <= overlap) return text;
  const tail = text.slice(-overlap);
  const firstSpace = tail.indexOf(' ');
  return firstSpace === -1 ? tail : tail.slice(firstSpace + 1);
}

/**
 * Stable hash identifying a chunk's content within its curriculum slot.
 *
 * Includes the curriculum identity so the same passage legitimately appearing in two chapters
 * yields two rows, while a re-extraction of the same page yields one. Content is normalised
 * first so trivial whitespace differences don't defeat deduplication — re-running ingestion
 * must never duplicate rows (`content_chunks` has a unique constraint on this).
 */
export function hashChunk(
  doc: Pick<SourceDocument, 'board' | 'classLevel' | 'subject' | 'chapterNo'>,
  content: string,
): string {
  const normalised = content.toLowerCase().replace(/\s+/g, ' ').trim();
  const identity = `${doc.board}|${doc.classLevel}|${doc.subject}|${doc.chapterNo}|${normalised}`;
  return createHash('sha256').update(identity).digest('hex');
}

/**
 * Chunk a whole document into rows ready for `content_chunks`.
 * Deduplicates within the document; the database unique constraint catches the rest.
 */
export function chunkDocument(doc: SourceDocument, options: ChunkOptions = {}): PreparedChunk[] {
  const prepared: PreparedChunk[] = [];
  const seen = new Set<string>();

  for (const section of doc.sections) {
    for (const content of chunkText(section.content, options)) {
      const contentHash = hashChunk(doc, content);
      if (seen.has(contentHash)) continue;
      seen.add(contentHash);

      prepared.push({
        board: doc.board,
        class_level: doc.classLevel,
        subject: doc.subject,
        chapter_no: doc.chapterNo,
        chapter_title: doc.chapterTitle,
        section: section.section,
        page_from: section.pageFrom ?? null,
        page_to: section.pageTo ?? null,
        source_type: doc.sourceType,
        language: doc.language,
        content,
        content_hash: contentHash,
      });
    }
  }

  return prepared;
}
