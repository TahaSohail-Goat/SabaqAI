// Shared, minimal wrappers around poppler-utils (pdftotext, pdftoppm) — the old crawler
// called spawnSync directly in three different places with three slightly different
// temp-dir/cleanup patterns; this is the one place that pattern lives now.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function isToolAvailable(bin: string): boolean {
  return !spawnSync(bin, ['-v'], { encoding: 'utf8' }).error;
}

export function checkPdftotextAvailable(): boolean {
  return isToolAvailable('pdftotext');
}

export function checkPdftoppmAvailable(): boolean {
  return isToolAvailable('pdftoppm');
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Direct text extraction via pdftotext. Returns '' for image-only PDFs (no selectable
 *  text) or if pdftotext isn't installed — callers fall back to OCR either way. */
export function extractTextDirect(pdfBuf: Buffer): string {
  if (!checkPdftotextAvailable()) return '';
  return withTempDir('sabaq-text-', (dir) => {
    const tmpPdf = path.join(dir, 'input.pdf');
    const tmpTxt = path.join(dir, 'output.txt');
    fs.writeFileSync(tmpPdf, pdfBuf);
    // -nopgbrk: no page break markers (cleaner chunking). -enc UTF-8: consistent encoding.
    const result = spawnSync('pdftotext', ['-nopgbrk', '-enc', 'UTF-8', tmpPdf, tmpTxt], { encoding: 'utf8', timeout: 30_000 });
    if (result.status !== 0 || !fs.existsSync(tmpTxt)) return '';
    return fs.readFileSync(tmpTxt, 'utf8');
  });
}

export interface RasterizedPage {
  pageNumber: number;
  pngPath: string;
}

/** Rasterizes every page of a PDF to PNG at the given DPI, in a caller-managed temp dir —
 *  the caller must call cleanupRasterizedDir(dir) when done. Kept outside withTempDir
 *  because OCR needs the files to persist across many tesseract calls, not just for one
 *  function's own lifetime. */
export function rasterizePdfToPng(pdfBuf: Buffer, dpi: number): { dir: string; pages: RasterizedPage[] } {
  if (!checkPdftoppmAvailable()) {
    throw new Error(
      'pdftoppm not found. Install poppler-utils to enable OCR for scanned PDFs.\n' +
      '  Ubuntu/GitHub Actions: sudo apt-get install -y poppler-utils tesseract-ocr\n' +
      '  Windows: install poppler from https://github.com/oschwartz10612/poppler-windows/releases'
    );
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaq-rasterize-'));
  const tmpPdf = path.join(dir, 'input.pdf');
  const pngPrefix = path.join(dir, 'page');
  fs.writeFileSync(tmpPdf, pdfBuf);

  // Generous 30-min timeout — measured directly against a real 222-page, 75MB scanned
  // textbook: still only ~half done at 10 minutes. A shorter timeout silently kills the
  // process mid-run, which spawnSync reports as status !== 0 with empty stderr — genuinely
  // misleading, since it looks like pdftoppm failed when it was actually still working.
  const result = spawnSync('pdftoppm', ['-png', '-r', String(dpi), tmpPdf, pngPrefix], { encoding: 'utf8', timeout: 30 * 60_000 });
  if (result.status !== 0) {
    const killedByTimeout = result.signal != null;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw new Error(
      killedByTimeout
        ? 'pdftoppm was killed after exceeding its timeout (30 min) — this book may be larger/slower than expected.'
        : `pdftoppm failed: ${result.stderr?.trim() || 'unknown error'}`
    );
  }

  // pdftoppm's zero-padded default numbering keeps a plain string sort in page order for any
  // book under 1000 pages.
  const pngFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  if (pngFiles.length === 0) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw new Error('pdftoppm produced no PNG files — PDF may be corrupt or empty.');
  }

  return {
    dir,
    pages: pngFiles.map((f, i) => ({ pageNumber: i + 1, pngPath: path.join(dir, f) })),
  };
}

export function cleanupRasterizedDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Rasterizes a specific page range to JPEG buffers, in page order — used by pdf-rebuild.ts
 *  to reconstruct a standalone per-chapter PDF from rendered images, and by
 *  structure/vision-verify.ts to render a single disputed page for Gemini. */
export function rasterizePageRangeToJpeg(pdfBuf: Buffer, pageFrom: number, pageTo: number, dpi: number, quality: number): Buffer[] {
  if (!checkPdftoppmAvailable()) {
    throw new Error('pdftoppm not found — needed to rasterize a page range.');
  }
  return withTempDir('sabaq-pdfrange-', (dir) => {
    const tmpPdf = path.join(dir, 'input.pdf');
    const jpgPrefix = path.join(dir, 'page');
    fs.writeFileSync(tmpPdf, pdfBuf);

    const result = spawnSync(
      'pdftoppm',
      ['-jpeg', '-jpegopt', `quality=${quality}`, '-r', String(dpi), '-f', String(pageFrom), '-l', String(pageTo), tmpPdf, jpgPrefix],
      { encoding: 'utf8', timeout: 5 * 60_000 }
    );
    if (result.status !== 0) {
      throw new Error(`pdftoppm failed while rasterizing pages ${pageFrom}-${pageTo}: ${result.stderr?.trim() || 'unknown error'}`);
    }

    const jpgFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
    if (jpgFiles.length === 0) {
      throw new Error(`No pages rendered for range ${pageFrom}-${pageTo}.`);
    }
    return jpgFiles.map((f) => fs.readFileSync(path.join(dir, f)));
  });
}
