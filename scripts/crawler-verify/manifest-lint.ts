// Phase 0 torture test — manifest-lint.ts
//
// Validates the new data/crawl-manifest/*.json files and proves a lossless round-trip
// against the old data/crawl-sources.json before that file is ever deleted. Exits non-zero
// on any failure; prints every check it ran either way, so a pass is a checked fact, not an
// absence of noise.
//
//   npx tsx scripts/crawler-verify/manifest-lint.ts

import fs from 'node:fs';
import path from 'node:path';
import { loadManifest, flattenManifest } from '../../src/lib/crawler/manifest/loader';
import { ALL_SUBJECT_CODES } from '../../src/lib/subjects';

const ROOT = process.cwd();
let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

interface OldCrawlSource {
  url: string;
  board: string;
  classLevel: number;
  subject: string;
  sourceType: string;
  language: string;
  year: number | null;
}

function main() {
  console.log('Manifest lint — Phase 0 torture test');
  console.log('='.repeat(60));

  // 1. Loads and validates against the real Zod schemas (subject/sourceType/URL-shape are
  //    already enforced here — a throw means this whole script fails loudly, matching
  //    ingest.ts's own "fail before spending quota" philosophy).
  const manifest = loadManifest();
  check('all 5 manifest files parse and validate against their schemas', true);

  // 2. Exact counts.
  // 8, not the original 5 — Class 10 Physics/Chemistry/Biology were added 2026-09-04 after
  // auditing found SSC-II science textbooks were silently absent (only Math 10 existed).
  check('exactly 8 textbook entries', manifest.textbooks.length === 8, `got ${manifest.textbooks.length}`);
  check('exactly 33 model_paper entries', manifest.modelPapers.length === 33, `got ${manifest.modelPapers.length}`);
  // 83/61, not the naive 7 subjects x 4 classes x 3 years = 84: real gaps on fbise.edu.pk's
  // own "Old Question Paper.php" clean matrix (a few "#" placeholder links, and a block of
  // 2022 rubrics only published as .docx/.xlsx, which this PDF-only pipeline can't ingest) —
  // see each entry's sibling gap in the scrape notes, not a bug in this count.
  check('exactly 83 past_paper entries (Phase 2 — fbise.edu.pk clean matrix, 2022-2024)', manifest.pastPapers.length === 83, `got ${manifest.pastPapers.length}`);
  check('exactly 61 marking_scheme entries (Phase 2 — fbise.edu.pk clean matrix, 2022-2024)', manifest.markingSchemes.length === 61, `got ${manifest.markingSchemes.length}`);
  check('0 bundle entries (not yet populated — Phase 3)', manifest.bundles.length === 0, `got ${manifest.bundles.length}`);

  // 3. All ids globally unique.
  const flat = flattenManifest(manifest);
  const idCounts = new Map<string, number>();
  for (const e of flat) idCounts.set(e.id, (idCounts.get(e.id) ?? 0) + 1);
  const duplicateIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  check('every entry id is globally unique', duplicateIds.length === 0, duplicateIds.join(', '));

  // 4. Every subject is a real ALL_SUBJECT_CODES value (redundant with the Zod schema, but
  //    asserted explicitly here since this exact invariant is the whole point of this phase).
  const badSubjects = flat.filter((e) => !ALL_SUBJECT_CODES.includes(e.subject));
  check('every entry subject is one of ALL_SUBJECT_CODES', badSubjects.length === 0, badSubjects.map((e) => e.id).join(', '));

  // 5. Every entry has at least one syntactically valid candidate URL (Zod's z.string().url()
  //    already enforced this at parse time; re-check count explicitly for a clear signal).
  const noUrls = flat.filter((e) => e.candidateUrls.length === 0);
  check('every entry has >=1 candidate URL', noUrls.length === 0, noUrls.map((e) => e.id).join(', '));

  // 6. Lossless round-trip against the old manifest, both directions — scoped to the source
  //    types the old crawler actually had (textbook, model_paper). past_paper/marking_scheme
  //    are Phase 2 additions the old crawler never produced at all (that gap is the reason
  //    this redesign exists), so "extra" tuples there are the intended outcome, not a bug.
  const oldPath = path.join(ROOT, 'data', 'crawl-sources.json');
  const old: OldCrawlSource[] = JSON.parse(fs.readFileSync(oldPath, 'utf8'));

  const tupleOf = (o: { board: string; classLevel: number; subject: string; sourceType: string; year: number | null }, url: string) =>
    `${o.board}|${o.classLevel}|${o.subject}|${o.sourceType}|${o.year ?? 'null'}|${url}`;

  const oldTuples = new Set(old.map((o) => tupleOf(o, o.url)));
  const newTuples = new Set(
    flat
      .filter((e) => e.sourceType === 'textbook' || e.sourceType === 'model_paper')
      .flatMap((e) =>
        e.candidateUrls.map((url) =>
          tupleOf({ board: e.board, classLevel: e.classLevel, subject: e.subject, sourceType: e.sourceType, year: 'year' in e ? e.year : null }, url)
        )
      )
  );

  const missingFromNew = [...oldTuples].filter((t) => !newTuples.has(t));
  let extraInNew = [...newTuples].filter((t) => !oldTuples.has(t));

  // Phase 1 grew textbook coverage past the original 5: the old crawl-sources.json never had
  // Class 10 Physics/Chemistry/Biology at all — SSC-II science was silently missing until this
  // was caught 2026-09-04 (see textbooks.json's own comments on these 3 entries). Their tuples
  // are the only allowed "extra" ones in an otherwise-exact round-trip.
  const knownNewTextbookIds = new Set(['fbise-10-physics-textbook', 'fbise-10-chemistry-textbook', 'fbise-10-biology-textbook']);
  const knownNewTuples = new Set(
    flat
      .filter((e) => knownNewTextbookIds.has(e.id))
      .flatMap((e) => e.candidateUrls.map((url) => tupleOf({ board: e.board, classLevel: e.classLevel, subject: e.subject, sourceType: e.sourceType, year: 'year' in e ? e.year : null }, url)))
  );
  extraInNew = extraInNew.filter((t) => !knownNewTuples.has(t));

  check('every old crawl-sources.json tuple exists in the new manifest', missingFromNew.length === 0, missingFromNew.join('; '));
  check('the new manifest introduces no unexpected tuples beyond the old one plus the 3 known Class-10-science additions', extraInNew.length === 0, extraInNew.join('; '));

  console.log('='.repeat(60));
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

main();
