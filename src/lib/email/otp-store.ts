// In-memory OTP store keyed by email.
//
// This is intentionally simple: it works correctly for a single-server deployment
// (local dev, single Vercel instance). For multi-instance production, swap the
// Map for a Supabase table with a TTL column and call storeOtp / verifyOtp via
// the service-role client instead.
//
// The store never persists to disk — a server restart clears all pending OTPs,
// which is a safe failure: the user just needs to request a new code.

const OTP_TTL_MS = 2 * 60 * 1000; // 2 minutes

interface OtpEntry {
  code: string;
  expiry: number; // Date.now() + TTL
  attempts: number;
}

// Module-level singleton. Next.js dev mode HMR can reset this — fine for dev.
const store = new Map<string, OtpEntry>();

/** Generate a cryptographically random 6-digit OTP string. */
export function generateOtp(): string {
  const { randomInt } = require('crypto') as typeof import('crypto');
  return randomInt(100000, 999999).toString();
}

/** Namespaces a password-reset code separately from a signup code for the same email —
 *  same underlying store, two independent single-use codes that can't collide. */
export function resetOtpKey(email: string): string {
  return `reset:${email}`;
}

/** Store an OTP for the given email, overwriting any existing entry. */
export function storeOtp(email: string, code: string): void {
  store.set(email.toLowerCase(), {
    code,
    expiry: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
}

/** Validate the OTP. Deletes the entry on success (single-use). */
export function verifyOtp(
  email: string,
  code: string
): 'valid' | 'expired' | 'invalid' | 'too_many_attempts' {
  const key = email.toLowerCase();
  const entry = store.get(key);

  if (!entry) return 'invalid';

  if (Date.now() > entry.expiry) {
    store.delete(key);
    return 'expired';
  }

  // Limit brute-force: max 5 wrong attempts before the entry is discarded.
  if (entry.attempts >= 5) {
    store.delete(key);
    return 'too_many_attempts';
  }

  if (entry.code !== code) {
    entry.attempts += 1;
    return 'invalid';
  }

  // Success — delete so the same code can't be reused.
  store.delete(key);
  return 'valid';
}

/** Same checks as verifyOtp but doesn't delete the entry on success — lets a caller
 *  confirm a code is right (e.g. to unlock a later step in a UI) without spending its
 *  one-time use. A wrong code still counts against the attempt limit, same as verifyOtp. */
export function peekOtp(
  email: string,
  code: string
): 'valid' | 'expired' | 'invalid' | 'too_many_attempts' {
  const key = email.toLowerCase();
  const entry = store.get(key);

  if (!entry) return 'invalid';

  if (Date.now() > entry.expiry) {
    store.delete(key);
    return 'expired';
  }

  if (entry.attempts >= 5) {
    store.delete(key);
    return 'too_many_attempts';
  }

  if (entry.code !== code) {
    entry.attempts += 1;
    return 'invalid';
  }

  return 'valid';
}
