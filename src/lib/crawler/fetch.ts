// Downloads a manifest entry's PDF, trying each candidateUrl in order until one succeeds —
// the old crawler only ever had one URL per source, with no fallback for a dead mirror.
// Also computes the SHA-256 checksum used for both crawl-state dedup and the OCR cache key.
//
// Caches the downloaded bytes on disk, keyed by URL — found necessary in practice, not
// theoretical: taleem360 intermittently rate-limits a URL that was just downloaded
// successfully moments earlier (the old crawler's own comments already noted this same host
// throttling repeated requests in one session), and a 40-70MB textbook is expensive to
// re-fetch just to re-run detection logic against unchanged bytes. Same philosophy as
// ocr.ts's checksum cache, one step earlier in the pipeline.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export interface FetchResult {
  buffer: Buffer;
  checksum: string;
  sourceUrl: string;
}

const PDF_CACHE_DIR = path.join(process.cwd(), 'data', '.pdf-cache');

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256OfString(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function cachePathForUrl(url: string): string {
  return path.join(PDF_CACHE_DIR, `${sha256OfString(url)}.pdf`);
}

async function downloadOne(url: string): Promise<Buffer> {
  // Node's fetch doesn't implement the file: scheme — a source already downloaded and
  // verified once (e.g. re-processing within the same session after the remote host starts
  // rate-limiting) needs its own path, not something fetch() can be coaxed into handling.
  if (url.startsWith('file://')) {
    return fs.readFileSync(fileURLToPath(url));
  }

  // 5 minutes: sized for a full scanned textbook (50-100MB+), not just a model paper — this
  // crawler has been run against the same host repeatedly in one session, which real hosts
  // often throttle.
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SabaqAI-Crawler/2.0 (educational; contact via github.com/TahaSohail-Goat/SabaqAI)',
    },
    signal: AbortSignal.timeout(5 * 60_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
    throw new Error(
      `Unexpected content-type "${contentType}" for ${url}. The URL may have moved or redirected to an HTML page.`
    );
  }

  return Buffer.from(await res.arrayBuffer());
}

/** Tries each candidate URL in order, returning the first that succeeds — a local disk copy
 *  first, if one exists from a previous run against this exact URL. Throws with every
 *  attempted URL's own failure reason if all fail — a manifest entry with dead mirrors
 *  should say precisely why, not just "download failed." */
export async function fetchManifestPdf(candidateUrls: string[]): Promise<FetchResult> {
  const failures: string[] = [];
  for (const url of candidateUrls) {
    const cached = cachePathForUrl(url);
    if (fs.existsSync(cached)) {
      const buffer = fs.readFileSync(cached);
      return { buffer, checksum: sha256(buffer), sourceUrl: url };
    }
    try {
      const buffer = await downloadOne(url);
      fs.mkdirSync(PDF_CACHE_DIR, { recursive: true });
      fs.writeFileSync(cached, buffer);
      return { buffer, checksum: sha256(buffer), sourceUrl: url };
    } catch (err) {
      failures.push(`  ${url}: ${(err as Error).message}`);
    }
  }
  throw new Error(`All ${candidateUrls.length} candidate URL(s) failed:\n${failures.join('\n')}`);
}
