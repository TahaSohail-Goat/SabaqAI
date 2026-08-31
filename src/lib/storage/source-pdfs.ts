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

// This project's Supabase account has an account-wide storage file-size ceiling at or below
// 50MB — confirmed directly, twice: raising this bucket's OWN configured limit to 100MB was
// rejected outright by updateBucket itself ("exceeded the maximum allowed size"), independent
// of any specific file upload. No per-bucket setting can raise it past the account's real cap,
// so 50MB is the actual usable ceiling here, not a target this file gets to choose.
//
// This is why source PDFs for full scanned textbooks (a 222-page book runs ~75MB whole) are
// uploaded per-CHAPTER, rebuilt from rendered page images (see scripts/crawl.ts's
// rebuildChapterPdf) rather than as one file — a chapter lands around 5-6MB, comfortably under
// this ceiling; the original whole-book file never could.
const MAX_PDF_SIZE = '50MB';
// The comparison threshold below MUST be derived from MAX_PDF_SIZE, not a separate hardcoded
// number — a prior version compared against a stale hardcoded 50_000_000 even after MAX_PDF_SIZE
// was (incorrectly) raised to 100MB, so a bucket already sitting at exactly the old 50MB limit
// was judged "doesn't need raising" and silently stayed at 50MB while the code believed it had
// succeeded. Keeping this derived avoids that class of drift again, even though the two values
// happen to match again now.
const MAX_PDF_SIZE_BYTES = 50 * 1000 * 1000;

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
  const needsRaise = currentLimit !== null && currentLimit !== undefined && currentLimit < MAX_PDF_SIZE_BYTES;
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
