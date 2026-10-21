import { AskFailure } from './config';

const windows = new Map<string, { start: number; requests: number; active: number }>();
let globalStart = 0, globalRequests = 0, globalActive = 0;
// Instance-local caps include anonymous clients rotating cookies. Replicas also need an
// ingress/distributed limiter; no private question text is retained in this registry.
export function acquireAskSlot(owner: string, now = Date.now()): () => void {
  if (now - globalStart >= 60000) { globalStart = now; globalRequests = 0; }
  for (const [key, state] of windows) if (!state.active && now - state.start >= 60000) windows.delete(key);
  let state = windows.get(owner);
  if (!state) {
    if (windows.size >= 1000) throw new AskFailure('rate_limited', 429, true);
    state = { start: now, requests: 0, active: 0 }; windows.set(owner, state);
  }
  if (now - state.start >= 60000) { state.start = now; state.requests = 0; }
  if (state.requests >= 6 || state.active >= 1 || globalRequests >= 30 || globalActive >= 4) throw new AskFailure('rate_limited', 429, true);
  state.requests++; state.active++; globalRequests++; globalActive++;
  let released = false;
  return () => { if (!released) { state!.active--; globalActive--; released = true; } };
}

export async function readBoundedJson(request: Request, signal: AbortSignal): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > 32000 || !request.body) throw new AskFailure('invalid_request', 400);
  const reader = request.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) throw new AskFailure('timeout', 504, true);
      const { done, value } = await reader.read();
      if (signal.aborted) throw new AskFailure('timeout', 504, true);
      if (done) break;
      length += value.byteLength;
      if (length > 32000) { await reader.cancel(); throw new AskFailure('invalid_request', 400); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AskFailure('invalid_request', 400); }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

export async function withinDeadline<T>(action: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new AskFailure('timeout', 504, true);
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new AskFailure('timeout', 504, true));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([action, cancelled]); }
  finally { signal.removeEventListener('abort', onAbort); }
}
