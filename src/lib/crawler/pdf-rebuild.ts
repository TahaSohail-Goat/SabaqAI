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
  for (const jpegBytes of jpegBuffers) {
    const jpg = await doc.embedJpg(jpegBytes);
    const page = doc.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
  }

  return Buffer.from(await doc.save());
}
