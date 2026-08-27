// Keeps quiz answers out of the browser until the student submits.
//
// docs/database.md: "The correct answer is never sent to the browser before the student submits."
// The route previously shipped `correctIndex` and `explanation` with every question, so the whole
// answer key was one devtools panel away.
//
// The key is now ENCRYPTED (AES-256-GCM) into an opaque token. Encryption, not just signing:
// a signed-but-base64 token still lets anyone decode the payload and read the answers, which
// would leave the original bug in place behind a longer string. GCM gives confidentiality AND
// integrity, so the token can be neither read nor forged.
//
// Stateless on purpose: works on serverless with no database and no shared cache. Once the
// `quizzes` / `quiz_questions` tables are actually written to, grading can look the key up by
// quiz id instead and this module becomes unnecessary.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface AnswerKeyEntry {
  questionId: string;
  correctIndex: number;
  explanation: string;
}

interface Payload {
  key: AnswerKeyEntry[];
  /** Unix ms. Tokens expire so a captured one can't be replayed indefinitely. */
  exp: number;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — a quiz session, not a day

let ephemeralSecret: string | null = null;

function secretKey(): Buffer {
  let secret = process.env.QUIZ_SECRET;

  if (!secret) {
    // No secret set: derive a per-process random one. Fine for local dev, but every deployment
    // instance gets a different key — so on serverless a token encrypted by one instance will not
    // decrypt on another, and grading fails intermittently.
    if (!ephemeralSecret) {
      ephemeralSecret = randomBytes(32).toString('hex');
      console.warn(
        'QUIZ_SECRET is not set. Using an ephemeral per-process key — quiz grading will fail ' +
        'intermittently on multi-instance deployments. Set it before deploying.'
      );
    }
    secret = ephemeralSecret;
  }

  // AES-256 needs exactly 32 bytes; hash whatever length the configured secret happens to be.
  return createHash('sha256').update(secret).digest();
}

/** Encrypt the answer key into an opaque token safe to hand to the browser. */
export function sealAnswerKey(key: AnswerKeyEntry[]): string {
  const payload: Payload = { key, exp: Date.now() + TOKEN_TTL_MS };
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, secretKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

/** Decrypt and validate. Returns null if tampered with, malformed, or expired. */
export function openAnswerKey(token: string): AnswerKeyEntry[] | null {
  if (typeof token !== 'string' || token.length === 0) return null;

  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const iv = raw.subarray(0, IV_BYTES);
    const authTag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, secretKey(), iv);
    decipher.setAuthTag(authTag);

    // Throws if the token was tampered with — GCM verifies integrity on final().
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const payload = JSON.parse(plaintext) as Payload;

    if (!payload || !Array.isArray(payload.key)) return null;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;

    return payload.key;
  } catch {
    return null;
  }
}
