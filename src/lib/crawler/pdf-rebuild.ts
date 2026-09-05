// Rebuilds a page range as a brand-new, standalone PDF — by rendering each page to a JPEG
// and re-assembling those images into a fresh PDFDocument, not by manipulating the source
// PDF's own structure at all. Ported verbatim from the old crawler (behavior unchanged).
//
// Why this exists, not a direct page-range extraction (pdfseparate/pdfunite, or pdf-lib
// loading the source directly): tested both against the real pilot textbook and both failed
// on that specific file — poppler's pdfunite refuses to merge pages carrying the source's
// encryption/permission flags, and pdf-lib's own parser throws on malformed object
// references inside the source, even with `ignoreEncryption: true`. Going through rendered
// images sidesteps both failure modes.
//
// Sized to stay well under Supabase Storage's account-wide 50MB ceiling (confirmed
// empirically — see src/lib/storage/source-pdfs.ts) — 120 DPI JPEG at quality 75 measured
// ~180KB/page against the pilot book, so even a 34-page chapter lands around 6MB.

import { PDFDocument } from 'pdf-lib';
import { rasterizePageRangeToJpeg } from './pdf-tools';

const REBUILD_DPI = 120;
const REBUILD_JPEG_QUALITY = 75;

export async function rebuildChapterPdf(pdfBuf: Buffer, pageFrom: number, pageTo: number): Promise<Buffer> {
  const jpegBuffers = rasterizePageRangeToJpeg(pdfBuf, pageFrom, pageTo, REBUILD_DPI, REBUILD_JPEG_QUALITY);

  const doc = await PDFDocument.create();
  for (let i = 0; i < jpegBuffers.length; i++) {
    const pageNo = pageFrom + i;
    const jpg = await embedJpgWithRetry(doc, jpegBuffers[i], pdfBuf, pageNo);
    const page = doc.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
  }

  return Buffer.from(await doc.save());
}

// pdf-lib's embedJpg occasionally rejects a byte-valid JPEG (correct SOI marker confirmed
// directly) with "SOI not found in JPEG" for one specific page in an otherwise-clean range —
// reproduced non-deterministically (the same page rasterizes fine on a later attempt), so this
// is a flaky rendering artifact for that one page, not a corrupt source page or a real bug in
// the embedder. Re-rasterizing just the offending single page and retrying the embed a few
// times resolves it without failing (or silently truncating) the whole chapter over one bad
// frame.
async function embedJpgWithRetry(doc: PDFDocument, firstAttempt: Buffer, pdfBuf: Buffer, pageNo: number, maxAttempts = 4) {
  let jpegBytes = firstAttempt;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await doc.embedJpg(jpegBytes);
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new Error(`Page ${pageNo} would not embed as a valid JPEG after ${maxAttempts} attempts: ${(err as Error).message}`);
      }
      console.error(`[pdf-rebuild] Page ${pageNo} failed to embed (attempt ${attempt}/${maxAttempts}: ${(err as Error).message}) — re-rasterizing just this page and retrying.`);
      [jpegBytes] = rasterizePageRangeToJpeg(pdfBuf, pageNo, pageNo, REBUILD_DPI, REBUILD_JPEG_QUALITY);
    }
  }
  // Unreachable — the loop above always returns or throws — keeps TS satisfied every path returns.
  throw new Error(`Page ${pageNo}: embed retry loop exited without a result.`);
}
