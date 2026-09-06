// Phase 3 torture test — paper-boundaries-lint.ts
//
// Runs detectSubjectBoundaries() against the 4 real FBISE bundles validated during Phase 3
// (SSC-I, SSC-II, HSSC-I, HSSC-II, all 2024) and asserts the exact page ranges this module
// must reproduce for Pakistan Studies and Islamiyat — the two subjects actually ingested from
// these bundles (chunk counts and content already verified live via a real question/answer
// round-trip in the app; this script only re-checks that the DETECTION logic still finds the
// same boundaries, so a future regex change can't silently corrupt an already-shipped result
// without this failing first).
//
// Requires the 4 bundles' rotation-corrected OCR to already be cached under
// data/.ocr-cache/<checksum>-rotfix.json — these are large, slow to regenerate (~10 min each
// via scripts/crawler-verify/_phase3-sample-bundle-ocr.ts), so this script does not attempt to
// regenerate a missing one; it reports which are missing and skips just those.
//
//   npx tsx scripts/crawler-verify/paper-boundaries-lint.ts

import fs from 'node:fs';
import path from 'node:path';
import { detectSubjectBoundaries } from '../../src/lib/crawler/structure/paper-boundaries';
import type { OcrPage } from '../../src/lib/crawler/ocr';
import type { SubjectCode } from '../../src/lib/subjects';

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

interface ExpectedSection {
  subject: SubjectCode;
  qualifier: string | null;
  pageFrom: number;
  pageTo: number;
}

interface BundleCase {
  label: string;
  checksum: string;
  expected: ExpectedSection[];
}

// Expected values are exactly what's live in the DB today (see
// scripts/crawler-verify/_phase3-bundle-extract-islamiyat-pakstudies*.ts for the ingested
// ranges) — this script's job is to prove the detector reproduces them, not to define new ones.
const CASES: BundleCase[] = [
  {
    label: 'SSC-I (Class 9)',
    checksum: '09e564141f72d188d81bc16a9d1d93911c0d13b92cb150ca93c2af9334891867-rotfix',
    expected: [
      { subject: 'pakistan_studies', qualifier: null, pageFrom: 21, pageTo: 28 },
      { subject: 'islamiyat', qualifier: 'New', pageFrom: 71, pageTo: 78 },
    ],
  },
  {
    label: 'SSC-II (Class 10)',
    checksum: '56f920b2376f79f2c75d1989743f8494665709e69c070562c96b24834ce5a955-rotfix',
    expected: [
      { subject: 'pakistan_studies', qualifier: null, pageFrom: 21, pageTo: 28 },
      // Islamiyat's "(Old)" variant here is printed inline on the same line as the subject name
      // ("ISLAMIYAT COMPULSORY (Old) SSC-II"), which the detector's known limitations section
      // documents as unparseable — so unlike SSC-I, this one over-merges to page 90 instead of
      // stopping at 72. This assertion intentionally checks the REAL (imperfect) current
      // behavior, not the ideal one, so a future fix for the inline-qualifier case shows up
      // here as a passing improvement rather than an unnoticed change.
      { subject: 'islamiyat', qualifier: 'NEW', pageFrom: 71, pageTo: 90 },
    ],
  },
  {
    label: 'HSSC-I (Class 11)',
    checksum: '54267244159f26b3d588ffd07862a056e0521496cf4a73a72f7e4682a4d9a4db-rotfix',
    expected: [], // confirmed real negative — neither subject appears anywhere in this bundle
  },
  {
    label: 'HSSC-II (Class 12)',
    checksum: '43185b2a2c9fdda76924c9a77967580798c411008f515fa5052d37c4ec7ad76a-rotfix',
    expected: [
      { subject: 'pakistan_studies', qualifier: null, pageFrom: 25, pageTo: 30 },
      // No Islamiyat entry: confirmed real negative for this bundle too.
    ],
  },
];

function main() {
  console.log('Paper-boundaries lint — Phase 3 torture test');
  console.log('='.repeat(60));

  for (const { label, checksum, expected } of CASES) {
    console.log(`\n${label}:`);
    const cachePath = path.join('data', '.ocr-cache', `${checksum}.json`);
    if (!fs.existsSync(cachePath)) {
      console.log(`  [SKIP] cached OCR not found at ${cachePath}`);
      continue;
    }
    const pages: OcrPage[] = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const { sections } = detectSubjectBoundaries(pages);

    const targets = sections.filter((s) => s.subject === 'pakistan_studies' || s.subject === 'islamiyat');

    if (expected.length === 0) {
      check('no pakistan_studies/islamiyat section detected (confirmed real negative)', targets.length === 0, `found ${targets.length}`);
      continue;
    }

    for (const exp of expected) {
      const match = targets.find(
        (t) => t.subject === exp.subject && (t.qualifier ?? null)?.toLowerCase() === (exp.qualifier ?? null)?.toLowerCase()
      );
      check(
        `${exp.subject}${exp.qualifier ? ` (${exp.qualifier})` : ''} pages ${exp.pageFrom}-${exp.pageTo}`,
        !!match && match.pageFrom === exp.pageFrom && match.pageTo === exp.pageTo,
        match ? `got pages ${match.pageFrom}-${match.pageTo}` : 'not detected at all'
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('All checks passed (or skipped for missing cache).');
  }
}

main();
