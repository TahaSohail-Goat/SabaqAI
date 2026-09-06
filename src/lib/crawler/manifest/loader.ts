// Loads and validates every data/crawl-manifest/*.json file. Replaces
// data/crawl-sources.json's single flat file with one file per content type, each
// Zod-checked against the real DB-backed subject/sourceType values before any network call
// is ever made — the old crawler's manifest was parsed with a bare, unchecked
// `JSON.parse(...) as CrawlSource[]`.

import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import {
  textbookManifestSchema,
  modelPaperManifestSchema,
  pastPaperManifestSchema,
  bundleManifestSchema,
} from './schema';
import type {
  ManifestEntry,
  TextbookManifestEntry,
  ModelPaperManifestEntry,
  PastPaperManifestEntry,
  BundleManifestEntry,
} from '../types';

const MANIFEST_DIR = path.join(process.cwd(), 'data', 'crawl-manifest');

function loadAndValidate<T>(filename: string, schema: z.ZodType<T>): T {
  const filePath = path.join(MANIFEST_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Manifest file missing: ${filePath}`);
  }
  const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${filename} failed manifest validation:\n${result.error.message}`);
  }
  return result.data;
}

export interface LoadedManifest {
  textbooks: TextbookManifestEntry[];
  modelPapers: ModelPaperManifestEntry[];
  pastPapers: PastPaperManifestEntry[];
  bundles: BundleManifestEntry[];
}

/** Loads all four manifest files, individually validated. Throws (not returns an error
 *  object) on the first invalid file — matches scripts/ingest.ts's existing philosophy of
 *  failing before any API quota is spent, not partway through a run.
 *
 *  marking-schemes.json still exists on disk (61 real entries) but is deliberately not loaded
 *  here — a separate PR on main removed marking_scheme as a source type from the schema
 *  entirely (supabase/migrations/0016_remove_marking_scheme.sql, already applied live), so
 *  loading it would just produce entries the ingest pipeline can no longer write anywhere. */
export function loadManifest(): LoadedManifest {
  return {
    textbooks: loadAndValidate('textbooks.json', textbookManifestSchema) as TextbookManifestEntry[],
    modelPapers: loadAndValidate('model-papers.json', modelPaperManifestSchema) as ModelPaperManifestEntry[],
    pastPapers: loadAndValidate('past-papers.json', pastPaperManifestSchema) as PastPaperManifestEntry[],
    bundles: loadAndValidate('bundles.json', bundleManifestSchema) as BundleManifestEntry[],
  };
}

export function flattenManifest(m: LoadedManifest): ManifestEntry[] {
  return [...m.textbooks, ...m.modelPapers, ...m.pastPapers, ...m.bundles];
}
