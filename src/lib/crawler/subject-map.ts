// Maps FBISE's own on-site subject naming to this app's exact ALL_SUBJECT_CODES strings.
// No such mapping existed before this redesign — every data/crawl-sources.json entry's
// `subject` field was hand-typed correctly by whoever wrote it, with no code checking that
// a new entry's subject actually matches what FBISE calls it.
//
// Every alias below was observed directly on fbise.edu.pk during the crawler redesign's
// site research (the "Old Question Paper.php" rubrics matrix's column headers, and real
// filenames/URL segments from syllabus.php and the model-paper manifest already in use) —
// none are guessed. Deliberately does NOT include labels for subjects outside this app's
// 9 tracked codes (e.g. "Islamic Studies", "Islamic History", "General Science", "Economics"
// are real, distinct FBISE subjects, not aliases for anything we track) — an unmapped label
// must fail loud via UnknownFbiseSubjectError, not silently guess the nearest match.

import { ALL_SUBJECT_CODES, type SubjectCode } from '@/lib/subjects';

export class UnknownFbiseSubjectError extends Error {
  constructor(public readonly label: string) {
    super(
      `No mapping to an app subject code for FBISE label "${label}". ` +
      `Add it to FBISE_SUBJECT_ALIASES in src/lib/crawler/subject-map.ts only after ` +
      `confirming it really is one of: ${ALL_SUBJECT_CODES.join(', ')}.`
    );
    this.name = 'UnknownFbiseSubjectError';
  }
}

const FBISE_SUBJECT_ALIASES: Record<string, SubjectCode> = {
  biology: 'biology',
  chemistry: 'chemistry',
  computer: 'computer_science',
  'computer science': 'computer_science',
  english: 'english',
  math: 'mathematics',
  maths: 'mathematics',
  mathematics: 'mathematics',
  physics: 'physics',
  urdu: 'urdu',
  islamiyat: 'islamiyat',
  // normalise() always strips parentheses from the input before this lookup runs, so a key
  // that still has parens in it (as this one originally did — "islamiyat (compulsory)") could
  // never actually be reached by any real input. Real FBISE bundle text reads "ISLAMIYAT
  // COMPULSORY" (no parens at all) — confirmed directly during Phase 3 bundle-splitting.
  'islamiyat compulsory': 'islamiyat',
  'islamic compulsory': 'islamiyat',
  'pakistan studies': 'pakistan_studies',
};

/** Normalises an FBISE-site label for lookup: trims, lowercases, collapses whitespace, and
 *  strips a parenthetical suffix like " (SNC 2022)" or " HSSC-I" that some pages append —
 *  the alias table itself stays free of that noise. */
function normalise(label: string): string {
  return label
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(SSC|HSSC)-(I{1,2}|1|2)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveFbiseSubject(label: string): SubjectCode {
  const normalised = normalise(label);
  const resolved = FBISE_SUBJECT_ALIASES[normalised];
  if (!resolved) throw new UnknownFbiseSubjectError(label);
  return resolved;
}
