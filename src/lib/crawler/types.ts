// Shared types for the new crawler pipeline (crawler redesign — see the plan doc for the
// full history). Every module here imports the app's real source-of-truth types
// (AskSourceType from src/lib/types.ts, SubjectCode from src/lib/subjects.ts) instead of
// re-declaring a narrower local copy.
//
// marking_scheme was supported here through Phase 2 (real, tracked ingestion of 61 documents),
// but a separate PR on main (supabase/migrations/0016_remove_marking_scheme.sql) dropped it
// from the schema entirely, on the premise that the crawler never produced it — no longer true
// once this existed, but the removal already ran against the live DB, and the call was made to
// accept it rather than re-litigate: dropped here too rather than leaving the two out of sync.

import type { AskSourceType } from '@/lib/types';
import type { SubjectCode } from '@/lib/subjects';

export type { AskSourceType, SubjectCode };

export type CrawlerLanguage = 'en' | 'ur';

/** Shared section-sizing cap for both flat documents (model/past papers, marking schemes)
 *  and per-chapter textbook sections — kept as one constant, imported everywhere it applies,
 *  since it's the same product decision applied to two different content shapes. Matches the
 *  old crawler's value exactly (not chunker.ts's own, larger, embedding-chunk-size default —
 *  a different constant for a different purpose). */
export const MAX_SECTION_CHARS = 2000;

interface ManifestEntryBase {
  /** Globally unique within the manifest. Used for idempotent re-processing and for
   *  referencing an entry in run reports / human-approved allowlists (e.g. a book that
   *  legitimately has no detectable table of contents). */
  id: string;
  board: string;
  classLevel: number;
  subject: SubjectCode;
  language: CrawlerLanguage;
  /** Ordered by preference — fetch.ts tries each in turn until one succeeds. Almost always
   *  a single URL today; the array exists so a dead mirror doesn't require a schema change
   *  later, just a second entry here. */
  candidateUrls: string[];
  /** Free-text provenance/verification notes, carried over from data/crawl-sources.json's
   *  "comment" field. Display-only, never parsed. */
  comment?: string;
}

export interface TextbookManifestEntry extends ManifestEntryBase {
  sourceType: 'textbook';
}

export interface ModelPaperManifestEntry extends ManifestEntryBase {
  sourceType: 'model_paper';
  year: number | null;
}

export interface PastPaperManifestEntry extends ManifestEntryBase {
  sourceType: 'past_paper';
  year: number;
}

// A bundled FBISE PDF containing several subjects' papers concatenated in one file — not a
// sourceType of its own (see structure/paper-boundaries.ts, Phase 3), but its own manifest
// shape since it needs expectedSubjects to cross-check the split against.
export interface BundleManifestEntry extends ManifestEntryBase {
  sourceType: 'past_paper';
  year: number;
  /** Every subject this bundle is known — by manually opening the real file, never assumed
   *  from its filename — to contain. structure/paper-boundaries.ts's split must produce
   *  exactly this set; a mismatch (either direction) fails the ingest for that bundle. */
  expectedSubjects: SubjectCode[];
}

export type ManifestEntry =
  | TextbookManifestEntry
  | ModelPaperManifestEntry
  | PastPaperManifestEntry
  | BundleManifestEntry;
