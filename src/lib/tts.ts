// Browser text-to-speech helper — no API key, no server round-trip (see ChatMessage.tsx). Picks
// a voice that doesn't sound as harsh/robotic as the OS default where possible — inherently
// limited by whatever voices the browser/OS ships, there's no universal "soft" voice.

const LANG_TAGS = ['en-us', 'en-gb', 'en-in', 'en'];

// Ranked preferences — the higher-quality, less robotic-sounding voices most browsers ship,
// checked in order. Matched by substring against voice.name (case-insensitive).
const PREFERRED_VOICE_NAMES = ['Google UK English Female', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Samantha', 'female'];

/** Chrome loads voices asynchronously — an immediate getVoices() call can return []. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timeout);
      resolve(window.speechSynthesis.getVoices());
    };
  });
}

async function pickVoice(): Promise<SpeechSynthesisVoice | null> {
  const voices = await loadVoices();
  if (voices.length === 0) return null;

  const inLanguage = voices.filter((v) => LANG_TAGS.some((tag) => v.lang.toLowerCase().startsWith(tag)));
  const pool = inLanguage.length > 0 ? inLanguage : voices;

  for (const preferred of PREFERRED_VOICE_NAMES) {
    const match = pool.find((v) => v.name.toLowerCase().includes(preferred.toLowerCase()));
    if (match) return match;
  }

  return inLanguage[0] ?? null; // any English voice beats the OS default
}

export interface SpeakHandle {
  stop: () => void;
}

/** Speaks `text`, tuned slightly slower/lower-pitched for a softer delivery than the OS
 *  default. Cancels any other utterance first — only one reply should ever be read at once. */
export async function speak(text: string, onEnd: () => void): Promise<SpeakHandle> {
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = await pickVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = LANG_TAGS[0];
  utterance.pitch = 0.92;
  utterance.rate = 0.93;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;

  window.speechSynthesis.speak(utterance);
  return { stop: () => window.speechSynthesis.cancel() };
}
