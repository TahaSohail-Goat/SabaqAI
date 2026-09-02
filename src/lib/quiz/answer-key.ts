// Keeps a generated quiz's answers/grading spec out of the browser until the student submits,
// AND keeps the quiz itself unrecorded until then too.
//
// docs/database.md: "The correct answer is never sent to the browser before the student submits."
// The route previously shipped `correctIndex` and `explanation` with every question, so the whole
// answer key was one devtools panel away.
//
// This module used to just carry the answer key (grading data only) — persistence happened
// eagerly at generation time via persistQuiz(), before the student had answered anything. That
// meant every quiz a student generated showed up as a real DB row even if they never attempted
// a single question and immediately navigated away — a "quiz taken" record for a quiz nobody
// actually took. Fixed by moving ALL persistence to submit time: generation now always returns
// this token, carrying everything needed both to grade AND to persist the quiz for the first
// time (position/stem/type/chunkId/options/etc, not just the answer key) — /api/quiz/grade is
// the only place that ever calls persistQuiz, and only when there's a real submission.
//
// The token is ENCRYPTED (AES-256-GCM), not just signed: a signed-but-base64 token still lets
// anyone decode the payload and read the answers, which would leave the original bug in place
// behind a longer string. GCM gives confidentiality AND integrity, so the token can be neither
// read nor forged.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { QuestionType } from '@/lib/quiz/persist';

export type QuizTokenQuestion =
  | {
      id: string;
      position: number;
      stem: string;
      questionType: 'mcq';
      chunkId: string | null;
      options: string[];
      correctIndex: number;
      explanation: string;
    }
  | {
      id: string;
      position: number;
      stem: string;
      questionType: 'short' | 'long';
      chunkId: string | null;
      modelAnswer: string;
      rubric: string;
      maxScore: number;
    };

export interface QuizToken {
  /** Resolved at generation time (chapters is shared curriculum metadata, not a per-student
   *  record, so upserting it eagerly doesn't create a "did I take this quiz" record). Null when
   *  Supabase wasn't configured — grading still works, persistence at submit time is just
   *  skipped, same as today. */
  chapterId: string | null;
  topicLabel: string | null;
  questions: QuizTokenQuestion[];
}

interface Payload {
  data: QuizToken;
  /** Unix ms. Tokens expire so a captured one can't be replayed indefinitely. */
  exp: number;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
// 2 hours — a quiz session, not a day. Exported so the draft routes can flag a stored quiz
// whose token has aged past the point it can still be graded.
export const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

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

/** Encrypt a freshly generated quiz into an opaque token safe to hand to the browser. */
export function sealQuizToken(data: QuizToken): string {
  const payload: Payload = { data, exp: Date.now() + TOKEN_TTL_MS };
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, secretKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

/** Decrypt and validate. Returns null if tampered with, malformed, or expired. */
export function openQuizToken(token: string): QuizToken | null {
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

    if (!payload || !payload.data || !Array.isArray(payload.data.questions)) return null;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;

    return payload.data;
  } catch {
    return null;
  }
}

// Re-exported so callers don't need a separate import just for the discriminant type.
export type { QuestionType };
