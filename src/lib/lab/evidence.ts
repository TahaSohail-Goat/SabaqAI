import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getServiceRoleClient } from '../supabase/admin';
import { getSourcePdfUrl } from '../storage/source-pdfs';
import type { LabEvidence } from '../types';
import { EVIDENCE_PINS, CHAPTER_PDF_SHA256 } from './evidence-pins';
import { EVIDENCE_VERSION, EXPERIMENTS, LAB_SCOPE } from './registry';
import { LabFailure } from './contracts';

// Only PDF byte verification is cached, for five minutes. This is not session/history storage.
let checkedPdf: { url: string; until: number } | undefined;
export async function loadLabEvidence(signal: AbortSignal): Promise<LabEvidence> {
  const db = getServiceRoleClient();
  if (!db) throw new LabFailure('Concept Lab needs Supabase configuration. See PHYSICS_LAB_DEMO.md.');
  const { data: source, error } = await db.from('chapter_sources')
    .select('id, storage_path, source_type, language_code, chapters!inner(id, board_code, class_level, subject_code, chapter_no, chapter_title), sections(page_from)')
    .eq('id', LAB_SCOPE.sourceId).eq('source_type', 'textbook').eq('language_code', 'en')
    .eq('chapters.board_code', LAB_SCOPE.board).eq('chapters.class_level', LAB_SCOPE.classLevel)
    .eq('chapters.subject_code', LAB_SCOPE.subject).eq('chapters.chapter_no', LAB_SCOPE.chapterNo).abortSignal(signal).maybeSingle();
  if (error || !source?.storage_path) throw new LabFailure('The pinned Kinematics chapter is unavailable. Check the local stack and source inventory in PHYSICS_LAB_DEMO.md.');
  const chapter = source.chapters as unknown as { id: string; chapter_title: string };
  const starts = source.sections.map((section) => section.page_from).filter((p): p is number => p !== null);
  const pageFrom = Math.min(...starts);
  if (pageFrom !== 35 || source.storage_path !== 'fbise/9/physics/textbook-2-en.pdf') throw new LabFailure('The chapter PDF mapping changed and needs a new evidence review. See docs/lab-evidence.md.');
  const pdfUrl = getSourcePdfUrl(db, source.storage_path);
  if (!checkedPdf || checkedPdf.url !== pdfUrl || checkedPdf.until <= Date.now()) {
    const response = await fetch(pdfUrl, { signal, cache: 'no-store' });
    if (!response.ok || Number(response.headers.get('content-length')) > 12000000) throw new LabFailure('The original chapter PDF is unavailable. Start local Storage and retry.');
    const reader = response.body?.getReader();
    if (!reader) throw new LabFailure('The chapter PDF could not be read.');
    const hasher = createHash('sha256'); let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 12000000) throw new LabFailure('The chapter PDF exceeds the reviewed size bound.');
        hasher.update(value);
      }
    } finally { await reader.cancel(); }
    if (hasher.digest('hex') !== CHAPTER_PDF_SHA256) throw new LabFailure('The chapter PDF changed and needs a new scientific review. See docs/lab-evidence.md.');
    checkedPdf = { url: pdfUrl, until: Date.now() + 300000 };
  }
  const { data: rows, error: chunkError } = await db.from('content_chunks')
    .select('id, content, sections!inner(source_id, section_label, page_from, page_to)')
    .eq('sections.source_id', source.id).in('id', EVIDENCE_PINS.map((pin) => pin.id)).abortSignal(signal);
  if (chunkError) throw new LabFailure('Kinematics evidence could not be loaded. Check the database and retry.');
  const parsedRows = z.array(z.object({ id: z.uuid(), content: z.string(), sections: z.object({ source_id: z.uuid(), section_label: z.string(), page_from: z.number().nullable(), page_to: z.number().nullable() }) })).parse(rows ?? []);
  const supported = EVIDENCE_PINS.filter((pin) => parsedRows.some((row) => row.id === pin.id && row.sections.source_id === source.id
    && row.sections.page_from === pin.from && row.sections.page_to === pin.to
    && createHash('sha256').update(row.content).digest('hex') === pin.hash));
  const keys = new Set<string>(supported.map((pin) => pin.key));
  const available = Object.fromEntries(EXPERIMENTS.map((experiment) => [experiment.id, experiment.evidenceKeys.every((key) => keys.has(key))])) as LabEvidence['available'];
  const reasons = Object.fromEntries(EXPERIMENTS.filter((e) => !available[e.id]).map((e) => [e.id, 'Required textbook evidence is missing or changed. This experiment needs a fresh source review.'])) as LabEvidence['reasons'];
  const citations = supported.map((pin) => {
    const row = parsedRows.find((candidate) => candidate.id === pin.id)!;
    return { chunkId: row.id, chapterNo: LAB_SCOPE.chapterNo, chapterTitle: chapter.chapter_title,
      section: row.sections.section_label, pageFrom: row.sections.page_from, pageTo: row.sections.page_to,
      sourceType: source.source_type, excerpt: row.content.slice(0, 900) };
  });
  return { version: EVIDENCE_VERSION, available, reasons, citations,
    unit: { sourceId: source.id, sourceLanguage: source.language_code, chapterNo: LAB_SCOPE.chapterNo, chapterTitle: chapter.chapter_title, pageFrom, pdfUrl } };
}
