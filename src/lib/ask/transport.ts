import { AskFailure } from './config';

const codes = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'] as const;
export type TransportCode = typeof codes[number] | 'fetch_failed';
export type ProviderRetryCode = TransportCode | 'HTTP_502' | 'HTTP_503' | 'HTTP_504' | 'HTTP_429';

// Never log raw SDK errors: they may include a request URL, student text or credentials.
// HTTP responses are not transport failures, including quota/auth/schema/service errors.
export function transportFailureCode(error: unknown): TransportCode | null {
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    if ('status' in current && typeof current.status === 'number') return null;
    current = 'cause' in current ? current.cause : null;
  }
  current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const code = 'code' in current ? current.code : undefined;
    if (typeof code === 'string' && codes.some((known) => known === code)) return code as TransportCode;
    if ('name' in current && (current.name === 'AbortError' || current.name === 'TimeoutError')) return null;
    current = 'cause' in current ? current.cause : null;
  }
  return error instanceof Error && /(?:fetch failed|failed to fetch)/i.test(error.message) ? 'fetch_failed' : null;
}

export function providerRetryCode(error: unknown): ProviderRetryCode | null {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
  if (/RESOURCE_EXHAUSTED|quota|rate.limit/i.test(message)) return null;
  if (error && typeof error === 'object' && 'status' in error) {
    if (error.status === 502) return 'HTTP_502';
    if (error.status === 503) return 'HTTP_503';
    if (error.status === 504) return 'HTTP_504';
  }
  return transportFailureCode(error);
}

export class AskTransientProviderFailure extends AskFailure {
  constructor(readonly retryCode: ProviderRetryCode) { super('unavailable', 503, true); }
}
export class AskTransportFailure extends AskTransientProviderFailure {
  constructor(code: TransportCode) { super(code); }
}
