import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AskFailure } from './config';
import { scopeSchema, understandingSchema } from './contracts';
import type { AskScope, Language, QuestionUnderstanding } from '../types';

// A configured shared secret supports multiple instances. Without one, restart invalidates
// contexts safely; no insecure constant or service-role secret is repurposed for signing.
const ephemeralSecret = randomBytes(32).toString('hex');
const contextSchema = z.object({
  version: z.literal(1), originalQuestion: z.string().max(4000), scope: scopeSchema,
  language: z.enum(['en', 'ur']), owner: z.string(), expires: z.number(),
  attempt: z.number().int().min(1).max(2), understanding: understandingSchema,
}).strict();
function signature(payload: string) {
  const secret = process.env.ASK_CLARIFICATION_SECRET || ephemeralSecret;
  if (secret.length < 32) throw new AskFailure('configuration', 503);
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
export function issueClarification(args: { originalQuestion: string; scope: AskScope; language: Language; owner: string; attempt: number; understanding: QuestionUnderstanding }, ttl: number) {
  const payload = Buffer.from(JSON.stringify({ ...args, version: 1, expires: Date.now() + ttl * 1000 })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function resumeClarification(token: string, originalQuestion: string, scope: AskScope, language: Language, owner: string) {
  try {
    const [payload, signed, extra] = token.split('.');
    if (!payload || !signed || extra || token.length > 24000) throw new Error();
    const actual = Buffer.from(signed);
    const expected = Buffer.from(signature(payload));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const context = contextSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (context.expires <= Date.now() || context.originalQuestion !== originalQuestion || context.owner !== owner || context.language !== language || JSON.stringify(context.scope) !== JSON.stringify(scope)) throw new Error();
    return context;
  } catch { throw new AskFailure('invalid_clarification', 400); }
}
