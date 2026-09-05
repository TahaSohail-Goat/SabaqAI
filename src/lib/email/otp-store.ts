// Email verification codes, stored in Postgres (auth_otps, migration 0017).
//
// This used to be a module-level Map. That works on a single long-lived server and breaks on
// Vercel, where every serverless instance gets its own copy: a code minted on instance A simply
// does not exist when the verify request lands on instance B, so a correct code is rejected —
// intermittently, which is harder to diagnose than a consistent failure. All three OTP flows
// (signup, password reset, account deletion) were affected. See 0017_auth_otps.sql.
//
// The four state functions are async now; everything else about the contract is unchanged, so
// callers only gained an `await`. Codes remain single-use, 2-minute TTL, 5 wrong attempts max.
//
// If Supabase isn't configured the store fails closed — verification returns 'invalid' rather
// than letting anything through.

import { getServiceRoleClient } from '@/lib/supabase/admin';

const OTP_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;

export type OtpResult = 'valid' | 'expired' | 'invalid' | 'too_many_attempts';

interface OtpRow {
  key: string;
  code: string;
  expires_at: string;
  attempts: number;
  created_at: string;
}

/** Generate a cryptographically random 6-digit OTP string. */
export function generateOtp(): string {
  const { randomInt } = require('crypto') as typeof import('crypto');
  return randomInt(100000, 999999).toString();
}

/** Namespaces a password-reset code separately from a signup code for the same email —
 *  same underlying table, two independent single-use codes that can't collide. */
export function resetOtpKey(email: string): string {
  return `reset:${email}`;
}

/** Namespaces an account-deletion code, same reasoning as resetOtpKey — this is the
 *  confirmation step for Google-only accounts, which have no password to re-enter. */
export function deleteAccountOtpKey(email: string): string {
  return `delete:${email}`;
}

/** Store an OTP for the given key, overwriting any existing entry (and resetting its attempt
 *  count and cooldown clock, since it's a genuinely new code). */
export async function storeOtp(key: string, code: string): Promise<void> {
  const admin = getServiceRoleClient();
  if (!admin) return;

  const now = Date.now();

  // Sweep expired rows on write. Cheap against auth_otps_expires_idx, and it keeps the table
  // from accumulating dead codes without needing a scheduled job for it.
  await admin.from('auth_otps').delete().lt('expires_at', new Date(now).toISOString());

  const { error } = await admin.from('auth_otps').upsert(
    {
      key: key.toLowerCase(),
      code,
      expires_at: new Date(now + OTP_TTL_MS).toISOString(),
      attempts: 0,
      created_at: new Date(now).toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) {
    console.error('otp-store: storeOtp failed:', error.message);
  }
}

// Shared by verifyOtp and peekOtp — identical checks, differing only in whether a correct code
// is consumed. Returning the row lets verifyOtp delete it by key afterwards.
async function checkOtp(key: string, code: string): Promise<OtpResult> {
  const admin = getServiceRoleClient();
  if (!admin) return 'invalid'; // fail closed

  const normalized = key.toLowerCase();
  const { data, error } = await admin
    .from('auth_otps')
    .select('key, code, expires_at, attempts, created_at')
    .eq('key', normalized)
    .maybeSingle<OtpRow>();

  if (error) {
    console.error('otp-store: lookup failed:', error.message);
    return 'invalid';
  }
  if (!data) return 'invalid';

  if (Date.now() > new Date(data.expires_at).getTime()) {
    await admin.from('auth_otps').delete().eq('key', normalized);
    return 'expired';
  }

  if (data.attempts >= MAX_ATTEMPTS) {
    await admin.from('auth_otps').delete().eq('key', normalized);
    return 'too_many_attempts';
  }

  if (data.code !== code) {
    await admin
      .from('auth_otps')
      .update({ attempts: data.attempts + 1 })
      .eq('key', normalized);
    return 'invalid';
  }

  return 'valid';
}

/** Validate the OTP. Deletes the entry on success (single-use). */
export async function verifyOtp(key: string, code: string): Promise<OtpResult> {
  const result = await checkOtp(key, code);

  if (result === 'valid') {
    const admin = getServiceRoleClient();
    if (admin) await admin.from('auth_otps').delete().eq('key', key.toLowerCase());
  }

  return result;
}

/** Same checks as verifyOtp but doesn't consume a correct code — lets a caller confirm a code
 *  is right (e.g. to unlock a later step in a UI) without spending its one-time use. A wrong
 *  code still counts against the attempt limit, same as verifyOtp. */
export async function peekOtp(key: string, code: string): Promise<OtpResult> {
  return checkOtp(key, code);
}

/** Seconds a caller must wait before another code may be sent for this key, or 0 if allowed.
 *
 *  Replaces the per-route in-memory `lastSent` Maps, which had the same multi-instance bug as
 *  the code store itself — on Vercel the cooldown simply didn't apply once traffic spread
 *  across instances, so the real protection here (not burning the SMTP account's quota) wasn't
 *  actually in force. Derived from the live row's created_at, so no second table is needed. */
export async function secondsUntilResendAllowed(key: string): Promise<number> {
  const admin = getServiceRoleClient();
  if (!admin) return 0;

  const { data, error } = await admin
    .from('auth_otps')
    .select('created_at')
    .eq('key', key.toLowerCase())
    .maybeSingle<{ created_at: string }>();

  if (error || !data) return 0;

  const elapsed = Date.now() - new Date(data.created_at).getTime();
  if (elapsed >= RESEND_COOLDOWN_MS) return 0;

  return Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
}
