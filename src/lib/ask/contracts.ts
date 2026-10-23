import { z } from 'zod';
import { ALL_SUBJECT_CODES, isSubjectOfferedForClass } from '../subjects';

const text = z.string().trim().min(1).max(1600);
export const scopeSchema = z.object({
  board: z.literal('FBISE'),
  classLevel: z.number().int().min(9).max(12),
  subject: z.string().refine((s) => ALL_SUBJECT_CODES.includes(s)),
  sourceType: z.enum(['textbook', 'past_paper', 'model_paper']).default('textbook'),
  chapterNo: z.number().int().positive().max(9999).optional(),
  sourceId: z.uuid().optional(),
}).strict().refine((s) => isSubjectOfferedForClass(s.subject, s.classLevel));

export const askRequestSchema = z.object({
  question: z.string().min(1).max(4000).refine((s) => s.trim().length > 0),
  board: z.literal('FBISE'),
  classLevel: z.number().int().min(9).max(12),
  subject: z.string(),
  sourceType: z.enum(['textbook', 'past_paper', 'model_paper']).default('textbook'),
  chapterNo: z.number().int().positive().max(9999).optional(),
  sourceId: z.uuid().optional(),
  language: z.enum(['en', 'ur']).default('en'),
  clarification: z.object({
    context: z.string().max(24000),
    optionId: z.string().max(40).optional(),
    freeText: text.optional(),
  }).strict().refine((c) => Boolean(c.optionId) !== Boolean(c.freeText)).optional(),
}).strict();

export const understandingSchema = z.object({
  status: z.enum(['ready', 'needs_clarification']),
  normalizedQuestion: text.nullable(),
  retrievalQuestion: text.nullable(),
  inputLanguage: z.enum(['en', 'ur', 'roman_ur', 'mixed', 'other']),
  intent: z.enum(['definition', 'explanation', 'comparison', 'mechanism', 'numerical', 'derivation', 'application', 'example', 'other']),
  concepts: z.array(z.string().trim().min(1).max(100)).max(8),
  corrections: z.array(z.object({ original: text, replacement: text }).strict()).max(20),
  ambiguityReasons: z.array(z.string().min(1).max(300)).max(4),
  clarification: z.object({
    question: z.string().min(1).max(300),
    options: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), label: z.string().min(1).max(120), interpretedQuestion: text }).strict()).max(3),
    allowFreeText: z.literal(true),
  }).strict().nullable(),
}).strict().superRefine((u, ctx) => {
  if (u.status === 'ready' && (!u.normalizedQuestion || !u.retrievalQuestion || u.clarification || u.ambiguityReasons.length))
    ctx.addIssue({ code: 'custom', message: 'Ready interpretation is incomplete or ambiguous.' });
  if (u.status === 'needs_clarification' && (!u.clarification || !u.ambiguityReasons.length))
    ctx.addIssue({ code: 'custom', message: 'Clarification needs a question and reason.' });
  const options = u.clarification?.options ?? [];
  if (options.length === 1 || new Set(options.map((o) => o.id)).size !== options.length || new Set(options.map((o) => o.label.toLowerCase())).size !== options.length)
    ctx.addIssue({ code: 'custom', message: 'Choices must be distinct, and either absent or two to three.' });
});

export const teachingSchema = z.object({
  answerable: z.boolean(), language: z.enum(['en', 'ur']),
  coverage: z.enum(['sufficient', 'partial', 'insufficient']),
  statements: z.array(z.object({
    id: z.string().regex(/^s[0-9]{1,3}$/), text: z.string().trim().min(1).max(1800),
    aspect: z.enum(['core', 'definition', 'mechanism', 'condition', 'relationship', 'formula', 'comparison', 'example']),
    chunkIds: z.array(z.string().min(1).max(100)).min(1).max(6),
    kind: z.enum(['explanation', 'book_example', 'illustration', 'derivation']),
  }).strict()).max(24),
  blocks: z.array(z.object({ kind: z.enum(['direct_answer', 'explanation', 'example', 'takeaway']), statementIds: z.array(z.string()).min(1).max(24) }).strict()).max(10),
  missingAspects: z.array(z.string().min(1).max(300)).max(8),
  calculation: z.object({
    statementId: z.string(), formulaChunkId: z.string(), formula: z.enum(['V=I*R', 'R=V/I', 'I=V/R']),
    inputs: z.array(z.object({ value: z.number().finite(), unit: z.enum(['V', 'A', 'ohm']), origin: z.enum(['student', 'book', 'assumed']) }).strict()).length(2),
    result: z.number().finite(), unit: z.enum(['V', 'A', 'ohm']),
  }).strict().nullable(),
}).strict();

export const reviewSchema = z.object({
  coherent: z.boolean(), coreSupported: z.boolean(),
  adequacy: z.object({
    verdict: z.enum(['complete', 'partial', 'inadequate']),
    reasoning: z.enum(['addressed', 'missing_evidence', 'omitted', 'not_requested']),
    example: z.enum(['used', 'available_but_missing', 'unavailable', 'not_needed']),
    reason: z.string().trim().min(1).max(500),
    missingAspects: z.array(z.string().trim().min(1).max(300)).max(8),
    repairEvidence: z.array(z.object({ chunkId: z.string().min(1), quote: z.string().trim().min(24).max(1000) }).strict()).max(6),
  }).strict(),
  verdicts: z.array(z.object({
    statementId: z.string(), verdict: z.enum(['supported', 'unsupported', 'uncertain']),
    chunkIds: z.array(z.string()).min(1).max(6), reason: z.string().min(1).max(300),
  }).strict()).max(24),
}).strict();
export type SupportReview = z.infer<typeof reviewSchema>;

const interpretationSchema = z.object({ originalQuestion: z.string(), normalizedQuestion: text, retrievalQuestion: text });
const citationSchema = z.object({
  chunkId: z.string(), chapterNo: z.number(), chapterTitle: z.string().nullable(), section: z.string().nullable(),
  pageFrom: z.number().nullable(), pageTo: z.number().nullable(), sourceType: z.string(), excerpt: z.string(),
});
const boundarySchema = z.object({
  scope: scopeSchema, sourceIds: z.array(z.string()), chapterIds: z.array(z.string()), sectionIds: z.array(z.string()),
  evidenceChunkIds: z.array(z.string()), coveredAspects: z.array(z.object({ aspect: z.string(), chunkIds: z.array(z.string()) })),
  missingRequestedAspects: z.array(z.string()), constraints: z.array(z.string()),
  coverage: z.enum(['sufficient', 'partial', 'insufficient']), truncated: z.boolean(),
});
// Used for network responses AND restored browser state. Unknown variants cannot render as success.
export const askResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('answered'), requestId: z.string().optional(),
    confidence: z.object({ band: z.enum(['high', 'medium']), top1: z.number().finite(), support: z.number().int() }),
    language: z.enum(['en', 'ur']), statements: z.array(z.object({ id: z.string().optional(), kind: z.enum(['explanation', 'book_example', 'illustration', 'derivation']).optional(), text: z.string().trim().min(1).max(1800), chunkIds: z.array(z.string()).min(1) })).min(1),
    citations: z.array(citationSchema).min(1), notCovered: z.string().nullable(), interpretation: interpretationSchema.optional(),
    blocks: teachingSchema.shape.blocks.optional(), boundary: boundarySchema.optional(), supportReview: z.enum(['model_reviewed', 'disabled']).optional(),
  }),
  z.object({ status: z.literal('refused'), reason: z.enum(['no_candidates', 'low_similarity', 'ungrounded_output']), message: z.string(),
    nearestChapters: z.array(z.object({ chapterNo: z.number(), chapterTitle: z.string().nullable(), score: z.number().finite() })), suggestion: z.string(), requestId: z.string().optional(), interpretation: interpretationSchema.optional() }),
  z.object({ status: z.literal('needs_clarification'), requestId: z.string(), originalQuestion: z.string(), question: z.string(), options: z.array(z.object({ id: z.string(), label: z.string() })).max(3), context: z.string().max(24000), allowFreeText: z.literal(true) }),
  z.object({ status: z.literal('error'), requestId: z.string(), code: z.enum(['invalid_request', 'invalid_clarification', 'rate_limited', 'configuration', 'unavailable', 'invalid_output', 'timeout']), message: z.string(), retryable: z.boolean() }),
]).superRefine((result, ctx) => {
  if (result.status !== 'answered') return;
  const cited = new Set(result.citations.map((c) => c.chunkId));
  const ids = result.statements.map((s) => s.id);
  const refs = result.blocks?.flatMap((b) => b.statementIds);
  if (result.statements.some((s) => s.chunkIds.some((id) => !cited.has(id))) || (refs && (ids.some((id) => !id) || new Set(ids).size !== ids.length || refs.length !== ids.length || new Set(refs).size !== ids.length || refs.some((id) => !ids.includes(id)))))
    ctx.addIssue({ code: 'custom', message: 'Inconsistent answer references.' });
});
