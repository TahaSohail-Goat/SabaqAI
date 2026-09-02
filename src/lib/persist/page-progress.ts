// Client-only, best-effort persistence for a page's in-progress work (a half-asked question,
// an ungraded quiz attempt, a chat draft) — so a browser refresh or navigating away and back
// doesn't silently discard it. Nothing failed in these cases; the page just forgot, because
// that state lived in plain useState with nowhere else to go.
//
// Each saved entry carries a `scope` fingerprint (typically board+classLevel, sometimes plus
// subject) alongside the actual data. `loadPageProgress` only returns data whose scope matches
// what's asked for — this is what stops a stale save from a different subject/scope silently
// re-appearing somewhere it doesn't belong, without needing a separate storage key per scope
// value (which would leak entries for every subject a student has ever visited).

const PREFIX = 'sabaqai:progress:';

export function loadPageProgress<T>(key: string, scope: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scope: string; data: T };
    if (parsed?.scope !== scope) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function savePageProgress<T>(key: string, scope: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ scope, data }));
  } catch {
    // Best-effort — a full or blocked localStorage (private browsing, quota) shouldn't break
    // the page; it just means this session won't survive a refresh, same as before this existed.
  }
}

export function clearPageProgress(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // best-effort
  }
}

// Every key currently in use — logout clears all of them at once so a shared device doesn't
// carry one student's in-progress question/quiz/chat draft into the next student's session.
export const PAGE_PROGRESS_KEYS = ['doubts', 'quiz', 'chat'] as const;

export function clearAllPageProgress() {
  PAGE_PROGRESS_KEYS.forEach(clearPageProgress);
}
