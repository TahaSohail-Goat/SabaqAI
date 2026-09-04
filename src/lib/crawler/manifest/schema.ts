// Zod validation for data/crawl-manifest/*.json, replacing data/crawl-sources.json's
// completely unvalidated JSON.parse(...) as CrawlSource[]. zod is already a project
// dependency (used for API request validation) — no new dependency added.

import { z } from 'zod';
import { ALL_SUBJECT_CODES } from '@/lib/subjects';

// z.enum requires a non-empty literal tuple; ALL_SUBJECT_CODES is declared as `string[]` in
// src/lib/subjects.ts (its own single source of truth), so this cast is the one place that
// bridges the two — it's sound because ALL_SUBJECT_CODES is always non-empty and every
// element really is one of the literal SubjectCode strings.
const subjectCodeSchema = z.enum(ALL_SUBJECT_CODES as [string, ...string[]]);
const languageSchema = z.enum(['en', 'ur']);

const baseFields = {
  id: z.string().min(1),
  board: z.string().min(1),
  classLevel: z.number().int().min(9).max(12),
  subject: subjectCodeSchema,
  language: languageSchema,
  candidateUrls: z.array(z.string().url()).min(1),
  comment: z.string().optional(),
};

export const textbookEntrySchema = z.object({
  ...baseFields,
  sourceType: z.literal('textbook'),
});

export const modelPaperEntrySchema = z.object({
  ...baseFields,
  sourceType: z.literal('model_paper'),
  year: z.number().int().nullable(),
});

export const pastPaperEntrySchema = z.object({
  ...baseFields,
  sourceType: z.literal('past_paper'),
  year: z.number().int(),
});

export const markingSchemeEntrySchema = z.object({
  ...baseFields,
  sourceType: z.literal('marking_scheme'),
  year: z.number().int(),
});

export const bundleEntrySchema = z.object({
  ...baseFields,
  sourceType: z.enum(['past_paper', 'marking_scheme']),
  year: z.number().int(),
  expectedSubjects: z.array(subjectCodeSchema).min(1),
});

export const textbookManifestSchema = z.array(textbookEntrySchema);
export const modelPaperManifestSchema = z.array(modelPaperEntrySchema);
export const pastPaperManifestSchema = z.array(pastPaperEntrySchema);
export const markingSchemeManifestSchema = z.array(markingSchemeEntrySchema);
export const bundleManifestSchema = z.array(bundleEntrySchema);
