// Phase 1 pre-work — captures the "golden baseline" chapter count/titles for the 4
// currently-correct textbooks (Physics 9, Chemistry 9, Biology 9, Math 10) BEFORE the new
// pipeline touches them, so a later comparison can prove zero regression. Deliberately does
// NOT re-run OCR to get this: Physics 9/Chemistry 9/Biology 9 were already ingested (on a
// different machine, before this clone existed) — their correct chapter list already lives
// in the real, live `chapters` table, which is a strictly better source of truth than a
// fresh non-deterministic-in-principle OCR re-run would be. Math 10 has its OCR cache and
// data/source/*.json already in this clone, so those are read directly. Math 9 is
// deliberately excluded — its current chapter list IS the bug this phase fixes, not a
// baseline to preserve.
//
//   npx tsx scripts/crawler-verify/capture-textbook-baseline.ts <output-path>

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';

const DB_SOURCED_BOOKS = [
  { classLevel: 9, subject: 'physics' },
  { classLevel: 9, subject: 'chemistry' },
  { classLevel: 9, subject: 'biology' },
];

interface BaselineChapter {
  chapterNo: number;
  chapterTitle: string;
}

interface BaselineBook {
  classLevel: number;
  subject: string;
  source: 'live_db' | 'local_json';
  chapters: BaselineChapter[];
}

async function captureFromDb(admin: ReturnType<typeof requireServiceRoleClient>, classLevel: number, subject: string): Promise<BaselineBook> {
  // Scoped to sourceType='textbook' specifically via the chapter_sources join — a bare
  // `chapters` query would also pick up that subject's model_paper "chapter" (keyed by
  // year, e.g. 2025) and any other non-textbook source sharing the same board/class/subject,
  // which isn't part of the textbook chapter-count baseline this is meant to protect.
  const { data, error } = await admin
    .from('chapters')
    .select('chapter_no, chapter_title, chapter_sources!inner(source_type)')
    .eq('board_code', 'FBISE')
    .eq('class_level', classLevel)
    .eq('subject_code', subject)
    .eq('chapter_sources.source_type', 'textbook')
    .order('chapter_no');
  if (error) throw new Error(`DB query failed for ${subject} ${classLevel}: ${error.message}`);
  return {
    classLevel,
    subject,
    source: 'live_db',
    chapters: (data ?? []).map((r) => ({ chapterNo: r.chapter_no, chapterTitle: r.chapter_title })),
  };
}

function captureFromLocalJson(classLevel: number, subject: string): BaselineBook {
  const dir = path.join(process.cwd(), 'data', 'source');
  const prefix = `fbise-${classLevel}-${subject}-textbook-ch`;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  const chapters: BaselineChapter[] = files.map((f) => {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { chapterNo: doc.chapterNo, chapterTitle: doc.chapterTitle };
  }).sort((a, b) => a.chapterNo - b.chapterNo);
  return { classLevel, subject, source: 'local_json', chapters };
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error('usage: npx tsx scripts/crawler-verify/capture-textbook-baseline.ts <output-path>');
    process.exit(2);
  }

  const admin = requireServiceRoleClient();
  const books: BaselineBook[] = [];

  for (const { classLevel, subject } of DB_SOURCED_BOOKS) {
    const book = await captureFromDb(admin, classLevel, subject);
    console.log(`${subject} ${classLevel} (live DB): ${book.chapters.length} chapter(s)`);
    book.chapters.forEach((c) => console.log(`    Ch.${c.chapterNo} "${c.chapterTitle}"`));
    books.push(book);
  }

  const math10 = captureFromLocalJson(10, 'mathematics');
  console.log(`mathematics 10 (local JSON): ${math10.chapters.length} chapter(s)`);
  math10.chapters.forEach((c) => console.log(`    Ch.${c.chapterNo} "${c.chapterTitle}"`));
  books.push(math10);

  fs.writeFileSync(outputPath, JSON.stringify(books, null, 2), 'utf8');
  console.log(`\nBaseline written to ${outputPath}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
