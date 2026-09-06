// Phase 0 torture test — subject-map-lint.ts
//
// Exercises resolveFbiseSubject() against every FBISE subject-label variant actually
// observed live during the crawler redesign's site research, plus a set of real FBISE
// subjects that are deliberately NOT in scope — proving the alias table resolves what it
// should and fails loud on what it shouldn't, rather than silently guessing.
//
//   npx tsx scripts/crawler-verify/subject-map-lint.ts

import { resolveFbiseSubject, UnknownFbiseSubjectError } from '../../src/lib/crawler/subject-map';
import type { SubjectCode } from '../../src/lib/subjects';

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// Every label variant directly observed on fbise.edu.pk this session — the rubrics matrix's
// column headers ("Old Question Paper.php"), and real filename/URL segments from
// syllabus.php and the model-paper manifest already ported into data/crawl-manifest/.
const KNOWN_LABELS: { label: string; expected: SubjectCode }[] = [
  { label: 'BIOLOGY', expected: 'biology' },
  { label: 'Biology', expected: 'biology' },
  { label: 'CHEMISTRY', expected: 'chemistry' },
  { label: 'Chemistry', expected: 'chemistry' },
  { label: 'COMPUTER', expected: 'computer_science' },
  { label: 'Computer Science', expected: 'computer_science' },
  { label: 'ENGLISH', expected: 'english' },
  { label: 'English', expected: 'english' },
  { label: 'MATH', expected: 'mathematics' },
  { label: 'Maths', expected: 'mathematics' },
  { label: 'Mathematics', expected: 'mathematics' },
  { label: 'PHYSICS', expected: 'physics' },
  { label: 'Physics', expected: 'physics' },
  { label: 'URDU', expected: 'urdu' },
  { label: 'Urdu', expected: 'urdu' },
  { label: 'Islamiyat', expected: 'islamiyat' },
  { label: 'Islamiyat (Compulsory)', expected: 'islamiyat' },
  // The real form captured from actual FBISE bundle text during Phase 3 (no parentheses at
  // all) — added after finding the alias table's original 'islamiyat (compulsory)' key could
  // never be reached (normalise() strips parenthetical content before lookup, so that key only
  // ever matched by accident via the plain 'islamiyat' fallback, never on its own account) and
  // this exact no-parens form had no matching key at all until fixed.
  { label: 'ISLAMIYAT COMPULSORY', expected: 'islamiyat' },
  { label: 'Islamic Compulsory HSSC-1', expected: 'islamiyat' },
  { label: 'Pakistan Studies', expected: 'pakistan_studies' },
  { label: 'Pakistan Studies SSC-II', expected: 'pakistan_studies' },
];

// Real FBISE subjects confirmed to exist on the site, but deliberately outside this app's
// 9 tracked codes — must fail loud, never silently resolve to the "closest" tracked subject.
const OUT_OF_SCOPE_LABELS = ['Islamic Studies', 'Islamic History', 'General Science', 'Economics', 'Civics'];

function main() {
  console.log('Subject-map lint — Phase 0 torture test');
  console.log('='.repeat(60));

  for (const { label, expected } of KNOWN_LABELS) {
    try {
      const resolved = resolveFbiseSubject(label);
      check(`"${label}" -> ${expected}`, resolved === expected, `got "${resolved}"`);
    } catch (err) {
      check(`"${label}" -> ${expected}`, false, `threw: ${(err as Error).message}`);
    }
  }

  for (const label of OUT_OF_SCOPE_LABELS) {
    try {
      const resolved = resolveFbiseSubject(label);
      check(`"${label}" correctly fails loud (out of scope)`, false, `resolved to "${resolved}" instead of throwing`);
    } catch (err) {
      const isRightType = err instanceof UnknownFbiseSubjectError;
      check(
        `"${label}" correctly fails loud (out of scope)`,
        isRightType,
        isRightType ? undefined : `threw wrong error type: ${(err as Error).constructor.name}`
      );
    }
  }

  console.log('='.repeat(60));
  const total = KNOWN_LABELS.length;
  const passedKnown = KNOWN_LABELS.filter(({ label, expected }) => {
    try { return resolveFbiseSubject(label) === expected; } catch { return false; }
  }).length;
  console.log(`Known-label resolution: ${passedKnown}/${total}`);

  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

main();
