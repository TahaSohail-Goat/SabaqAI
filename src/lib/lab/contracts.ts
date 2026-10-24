import { z } from 'zod';
import { experimentIdSchema, labInputSchema, parameterKeySchema, quantitySchema } from './engine';

const common = { sessionToken: z.string().min(20).max(4000), requestId: z.uuid(), inputVersion: z.uuid(), issuedAt: z.number().int().positive() };
export const labRequestSchema = z.discriminatedUnion('action', [
  z.object({ ...common, action: z.literal('propose'), question: z.string().trim().min(3).max(800) }).strict(),
  z.object({ ...common, action: z.literal('run'), confirmed: z.literal(true), input: labInputSchema,
    mode: z.enum(['guided', 'exploration']), prediction: z.number().finite().min(-100000).max(100000).nullable(),
    reasoning: z.string().trim().max(600), question: z.string().trim().max(800), baseRunToken: z.string().max(10000).nullable(),
  }).strict().refine((r) => r.mode === 'exploration' || r.prediction !== null, 'Record a prediction before a guided run.'),
  z.object({ ...common, action: z.literal('explain'), runToken: z.string().min(20).max(10000), compareToken: z.string().max(10000).nullable() }).strict(),
]);
export type LabRequest = z.infer<typeof labRequestSchema>;
export const proposalSchema = z.object({
  action: z.enum(['propose', 'clarify', 'unsupported']), experimentId: experimentIdSchema.nullable(),
  parameters: z.array(z.object({ key: parameterKeySchema, quantity: quantitySchema }).strict()).max(6),
  clarification: z.enum(['experiment', 'duration', 'direction', 'acceleration']).nullable(),
}).strict();
export type LabProposal = z.infer<typeof proposalSchema>;
export const resultFieldSchema = z.enum(['duration', 'distance', 'displacement', 'finalPosition', 'finalVelocity', 'averageSpeed', 'averageVelocity']);
export const feedbackSchema = z.object({
  runId: z.uuid(), inputVersion: z.uuid(), solverVersion: z.string().max(60), evidenceVersion: z.string().max(80),
  blocks: z.array(z.enum(['uniform', 'acceleration', 'turning', 'journey', 'signed', 'graphs'])).min(1).max(4),
  observations: z.array(z.object({ runId: z.uuid(), field: resultFieldSchema }).strict()).min(1).max(5),
  followupId: z.enum(['change-speed', 'change-time', 'change-acceleration', 'change-initial', 'change-return', 'change-return-time']),
}).strict();
export type LabFeedbackAction = z.infer<typeof feedbackSchema>;

export class LabFailure extends Error {
  constructor(message: string, public status = 503, public retryable = false) { super(message); }
}
export function requireLabScope(context: { userId: string | null; profile: { board: string; classLevel: number; subjects: string[] } | null }) {
  if (!context.userId) throw new LabFailure('Sign in to use Concept Lab.', 401);
  if (!context.profile || context.profile.board !== 'FBISE' || context.profile.classLevel !== 9 || !context.profile.subjects.includes('physics')) {
    throw new LabFailure('This lab is available for students enrolled in FBISE Class 9 Physics. Check your curriculum in Settings.', 403);
  }
  return context.userId;
}
export function ensureFreshRequest(issuedAt: number, now = Date.now()) {
  // The receipt retention exceeds this window, so a replay cannot spend again after cleanup.
  if (issuedAt > now + 5000 || issuedAt < now - 90000) throw new LabFailure('This request expired. Try again to create a fresh request.', 409, true);
}
