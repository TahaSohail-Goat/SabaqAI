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
  sourceType: 'textbook' | 'past_paper' | 'model_paper';
  language: 'en' | 'ur';
  sections: SourceSection[];
}

/** One chunk of a section, ready for `content_chunks`. chunkIndex is 1-based within its section. */
export interface PreparedSectionChunk {
  chunkIndex: number;
  content: string;
  contentHash: string;
}

/** A section with its chunks — mirrors the `sections` → `content_chunks` tables in schema v2. */
export interface PreparedSection {
  section: string;
  /** 1-based order of the section within the document. */
  position: number;
  pageFrom: number | null;
  pageTo: number | null;
  chunks: PreparedSectionChunk[];
}

/**
 * A whole document, chunked and ready to hand to the ingest_document() RPC, which writes it in a
 * single transaction. The nested shape matches the normalised schema: chapter metadata lives at
 * the top, section metadata on the section, and a chunk carries only its own content.
 */
export interface PreparedDocument {
  board: string;
  classLevel: number;
  subject: string;
  chapterNo: number;
  chapterTitle: string;
  sourceType: 'textbook' | 'past_paper' | 'model_paper';
  language: 'en' | 'ur';
  sections: PreparedSection[];
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
 *
 * Includes sourceType and language too (crawler redesign, Phase 1) — content_chunks.content_hash
 * is unique across the WHOLE table, not scoped per section/source, so without this a marking
 * scheme and its own past paper sharing boilerplate text (e.g. "Time Allowed: 2 hours") would
 * silently collide: the second one ingested would `on conflict do nothing` and that chunk would
 * stay attached to whichever source ingested it first, showing the wrong sourceType on its
 * citation. Low-risk before this redesign (only textbook+model_paper existed); real risk the
 * moment past papers and marking schemes exist for the same chapters.
 */
export function hashChunk(
  doc: Pick<SourceDocument, 'board' | 'classLevel' | 'subject' | 'chapterNo' | 'sourceType' | 'language'>,
  content: string,
): string {
  const normalised = content.toLowerCase().replace(/\s+/g, ' ').trim();
  const identity = `${doc.board}|${doc.classLevel}|${doc.subject}|${doc.chapterNo}|${doc.sourceType}|${doc.language}|${normalised}`;
  return createHash('sha256').update(identity).digest('hex');
}

/**
 * Chunk a whole document into the nested shape ingest_document() expects.
 * Deduplicates within the document; the database unique constraint on content_hash catches the
 * rest. Chunks are numbered per section — schema v2 enforces unique(section_id, chunk_index).
 */
export function chunkDocument(doc: SourceDocument, options: ChunkOptions = {}): PreparedDocument {
  const seen = new Set<string>();

  const sections: PreparedSection[] = doc.sections.map((section, sectionIdx) => {
    const chunks: PreparedSectionChunk[] = [];
    for (const content of chunkText(section.content, options)) {
      const contentHash = hashChunk(doc, content);
      if (seen.has(contentHash)) continue;
      seen.add(contentHash);
      chunks.push({ chunkIndex: chunks.length + 1, content, contentHash });
    }
    return {
      section: section.section,
      position: sectionIdx + 1,
      pageFrom: section.pageFrom ?? null,
      pageTo: section.pageTo ?? null,
      chunks,
    };
  });

  return {
    board: doc.board,
    classLevel: doc.classLevel,
    subject: doc.subject,
    chapterNo: doc.chapterNo,
    chapterTitle: doc.chapterTitle,
    sourceType: doc.sourceType,
    language: doc.language,
    sections,
  };
}
