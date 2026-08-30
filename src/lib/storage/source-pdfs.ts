// Shared helper for the source-pdfs Storage bucket — the real PDF files behind /ask's
// immersive reader (see supabase/migrations/0011_source_pdf_storage.sql). Used by
// scripts/crawl.ts (future crawls) and scripts/backfill-pdf-storage.ts (the 33 docs already
// ingested before this existed). The bucket holds files, not the database — chapter_sources
// only ever stores a path string.

import type { SupabaseClient } from '@supabase/supabase-js';

export const SOURCE_PDF_BUCKET = 'source-pdfs';

export function sourcePdfPath(params: {
  board: string;
  classLevel: number;
  subject: string;
  sourceType: string;
  chapterNo: number;
}): string {
  const { board, classLevel, subject, sourceType, chapterNo } = params;
  return `${board.toLowerCase()}/${classLevel}/${subject}/${sourceType}-${chapterNo}.pdf`;
}

// A few source PDFs (scanned/image-heavy ones especially) run well past what a "textbook
// PDF" sounds like it should weigh — one biology model paper alone is ~20.5MB. 50MB is
// headroom over the largest seen so far, not a guess.
const MAX_PDF_SIZE = '50MB';

/** Creates the bucket if it doesn't exist yet, or raises its size limit if it's lower than
 *  MAX_PDF_SIZE — safe and idempotent to call every run. */
export async function ensureSourcePdfBucket(admin: SupabaseClient): Promise<void> {
  const { data: bucket, error } = await admin.storage.getBucket(SOURCE_PDF_BUCKET);
  if (error && error.message !== 'Bucket not found') {
    throw new Error(`Could not look up storage bucket: ${error.message}`);
  }

  if (!bucket) {
    // Public: textbook/paper PDFs are not sensitive — same reasoning /api/syllabus and
    // /api/ask/options already use for this content.
    const { error: createError } = await admin.storage.createBucket(SOURCE_PDF_BUCKET, {
      public: true,
      fileSizeLimit: MAX_PDF_SIZE,
      allowedMimeTypes: ['application/pdf'],
    });
    if (createError) throw new Error(`Could not create "${SOURCE_PDF_BUCKET}" bucket: ${createError.message}`);
    return;
  }

  const currentLimit = bucket.file_size_limit;
  const needsRaise = currentLimit !== null && currentLimit !== undefined && currentLimit < 50_000_000;
  if (needsRaise) {
    const { error: updateError } = await admin.storage.updateBucket(SOURCE_PDF_BUCKET, {
      public: true,
      fileSizeLimit: MAX_PDF_SIZE,
      allowedMimeTypes: ['application/pdf'],
    });
    if (updateError) throw new Error(`Could not raise "${SOURCE_PDF_BUCKET}" bucket's size limit: ${updateError.message}`);
  }
}

export async function uploadSourcePdf(admin: SupabaseClient, path: string, pdfBytes: Buffer): Promise<void> {
  const { error } = await admin.storage.from(SOURCE_PDF_BUCKET).upload(path, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`Could not upload "${path}": ${error.message}`);
}

export function getSourcePdfUrl(admin: SupabaseClient, path: string): string {
  return admin.storage.from(SOURCE_PDF_BUCKET).getPublicUrl(path).data.publicUrl;
}
