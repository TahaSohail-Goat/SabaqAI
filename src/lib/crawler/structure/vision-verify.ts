// Escalation of last resort for a disputed chapter boundary (structure/crosscheck.ts found a
// count mismatch or a low-similarity title pair) — renders ONLY the disputed page and asks
// Gemini directly what it is, since neither the cheap heuristic nor the book's own OCR'd ToC
// could resolve it alone. Never invoked per-page, never unconditionally — a handful of calls
// per book at most. Runs offline in batch (not against a waiting user), so it uses a
// stronger, not the fastest, model — the opposite trade-off from the live chat path's
// speed-optimized default (see src/lib/chat/models.ts).

import { getGeminiClient } from '../../gemini';
import { rasterizePageRangeToJpeg } from '../pdf-tools';

export interface VisionVerdict {
  isChapterStart: boolean;
  chapterNo: number | null;
  title: string | null;
  confidence: 'high' | 'low';
}

const DEFAULT_VISION_MODEL = 'gemini-2.5-pro';

function resolveVisionModel(): string {
  return process.env.CRAWLER_VISION_MODEL || DEFAULT_VISION_MODEL;
}

const SYSTEM_INSTRUCTION = `You are verifying whether a single page from a Pakistani school textbook is the FIRST page of a new chapter/unit.
Respond with ONLY a JSON object, no markdown fences, no prose: {"isChapterStart": boolean, "chapterNo": number|null, "title": string|null, "confidence": "high"|"low"}.
"title" should be the chapter's title as printed, in normal title case. Use "low" confidence if the page is ambiguous (e.g. a mid-chapter page, or the image is too unclear to read).`;

/** Returns null (never guesses) on a missing API key or an unparseable response — the
 *  caller decides how to fail (halt that book's ingestion), not this function. */
export async function verifyDisputedPage(args: {
  pdfBuf: Buffer;
  pageNumber: number;
  disputedTitle: string;
}): Promise<VisionVerdict | null> {
  const ai = getGeminiClient();
  if (!ai) {
    console.error('[vision-verify] GEMINI_API_KEY not set — cannot escalate disputed page, caller must halt.');
    return null;
  }

  let jpegBuffers: Buffer[];
  try {
    jpegBuffers = rasterizePageRangeToJpeg(args.pdfBuf, args.pageNumber, args.pageNumber, 150, 85);
  } catch (err) {
    console.error(`[vision-verify] Could not rasterize page ${args.pageNumber}:`, (err as Error).message);
    return null;
  }
  const [jpegBuffer] = jpegBuffers;
  if (!jpegBuffer) return null;

  try {
    const response = await ai.models.generateContent({
      model: resolveVisionModel(),
      contents: [
        {
          role: 'user',
          parts: [
            { text: `The heuristic detector's own guess for this page's chapter title was: "${args.disputedTitle}". Confirm, correct, or reject it.` },
            { inlineData: { mimeType: 'image/jpeg', data: jpegBuffer.toString('base64') } },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        temperature: 0,
      },
    });

    const responseText = response.text?.trim();
    if (!responseText) return null;
    const cleaned = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as VisionVerdict;
    if (typeof parsed.isChapterStart !== 'boolean') return null;
    return parsed;
  } catch (err) {
    console.error('[vision-verify] Gemini call failed:', err);
    return null;
  }
}
