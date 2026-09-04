// Phase 3 exploration — OCRs a real FBISE "Compulsory+Science+General" bundle to see its
// actual per-subject boundary signal before writing paper-boundaries.ts.
//
// A naive OCR pass (no rotation correction) produces near-garbage on most pages — tesseract's
// own OSD confirmed these scanned pages are rotated 90/270 degrees, not upright, and it varies
// per page within one bundle (different subject booklets scanned in different orientations).
// This version runs OSD per page and corrects via sharp before the real OCR pass. Result is
// cached under a `-rotfix` checksum suffix so it never collides with a naive, ungarbled-free
// cache entry for the same underlying PDF bytes.
//
//   npx tsx scripts/crawler-verify/_phase3-sample-bundle-ocr.ts <path-to-pdf>

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { rasterizePdfToPng, cleanupRasterizedDir } from '../../src/lib/crawler/pdf-tools';

const PDF_PATH = process.argv[2];
if (!PDF_PATH) {
  console.error('usage: npx tsx scripts/crawler-verify/_phase3-sample-bundle-ocr.ts <path-to-pdf>');
  process.exit(2);
}
const TESS = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';

interface OcrPage { pageNumber: number; text: string; rotationApplied: number }

function detectRotation(pngPath: string): number {
  const osd = spawnSync(TESS, [pngPath, 'stdout', '--psm', '0'], { encoding: 'utf8', timeout: 30_000 });
  if (osd.status !== 0) return 0; // OSD failed (e.g. too little text) — assume upright
  const match = osd.stdout.match(/Rotate: (\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function main() {
  const buf = fs.readFileSync(PDF_PATH);
  const baseChecksum = crypto.createHash('sha256').update(buf).digest('hex');
  const checksum = `${baseChecksum}-rotfix`;
  console.log(`Loaded ${buf.length} bytes, checksum ${checksum}`);

  const { dir, pages: rasterized } = rasterizePdfToPng(buf, 150);
  console.log(`Rasterized ${rasterized.length} page(s). Running per-page OSD + OCR...`);

  const start = Date.now();
  const pages: OcrPage[] = [];
  const rotationCounts: Record<number, number> = {};

  try {
    for (const { pageNumber, pngPath } of rasterized) {
      const rotateDeg = detectRotation(pngPath);
      rotationCounts[rotateDeg] = (rotationCounts[rotateDeg] ?? 0) + 1;

      let finalPath = pngPath;
      if (rotateDeg !== 0) {
        const rotatedBuf = await sharp(fs.readFileSync(pngPath)).rotate(rotateDeg).png().toBuffer();
        finalPath = pngPath.replace(/\.png$/, '.rot.png');
        fs.writeFileSync(finalPath, rotatedBuf);
      }

      const result = spawnSync(TESS, [finalPath, 'stdout'], { encoding: 'utf8', timeout: 60_000 });
      pages.push({ pageNumber, text: result.status === 0 ? (result.stdout ?? '') : '', rotationApplied: rotateDeg });

      if (pageNumber % 20 === 0) console.log(`  ...page ${pageNumber}/${rasterized.length}`);
    }
  } finally {
    cleanupRasterizedDir(dir);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`Done in ${elapsed}s.`);
  console.log('Rotation distribution:', rotationCounts);

  const outPath = path.join('data', '.ocr-cache', `${checksum}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(pages), 'utf8');
  console.log(`Cached at ${outPath}`);

  const totalChars = pages.reduce((n, p) => n + p.text.length, 0);
  console.log(`Total chars: ${totalChars}, avg/page: ${(totalChars / pages.length).toFixed(0)}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
