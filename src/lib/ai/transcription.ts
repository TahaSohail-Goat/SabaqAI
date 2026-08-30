// Speech-to-text via Groq's Whisper endpoint (OpenAI-compatible /audio/transcriptions shape).
// Text-to-speech deliberately has no server-side counterpart — that runs entirely in the
// browser via the Web Speech API (see ChatMessage.tsx), no API key or server round-trip needed.

const BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'whisper-large-v3';

export interface TranscribeOptions {
  /** BCP-47/ISO-639-1 language hint (e.g. "en", "ur"). Omit to let Whisper auto-detect. */
  language?: string;
}

function apiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error('GROQ_API_KEY is not set. Speech-to-text cannot run.');
  }
  return key;
}

/**
 * Transcribes a single audio clip. Throws on failure — callers decide how to surface that
 * (matches embedTexts' "fail loudly" convention in this codebase).
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
  filename: string,
  options: TranscribeOptions = {}
): Promise<string> {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
  form.set('model', process.env.STT_MODEL || DEFAULT_MODEL);
  form.set('response_format', 'json');
  if (options.language) form.set('language', options.language);

  const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Transcription failed (${response.status} ${response.statusText}): ${detail.slice(0, 400)}`);
  }

  const payload = (await response.json()) as { text?: string };
  return (payload.text ?? '').trim();
}
