export interface QuizCriterion {
  id: string;
  expectation: string;
  sourceQuote: string;
}

export interface QuizSourceCitation {
  chunkId: string;
  chapterNo: number;
  chapterTitle: string | null;
  section: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  excerpt: string;
}

export interface CriterionReview {
  criterionId: string;
  expectation: string;
  awarded: number;
  possible: number;
  deducted: number;
  reason: string;
  source: QuizSourceCitation;
}

export interface WrittenReview {
  correctAnswer: string;
  criteria: CriterionReview[];
  totalAwarded: number;
  totalPossible: number;
  totalDeducted: number;
}

/** Exact quote matching keeps generated marking points tied to the actual stored row. */
export function quoteInSource(quote: string, content: string): boolean {
  return quote.trim().length >= 20 && extractQuote(quote, content) !== null;
}

function extractQuote(quote: string, content: string): string | null {
  const pattern = quote.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return content.match(new RegExp(pattern, 'i'))?.[0] ?? null;
}

export function parseCriteria(raw: unknown, maxScore: number, content: string): QuizCriterion[] | null {
  if (!Array.isArray(raw) || raw.length !== maxScore) return null;
  const criteria: QuizCriterion[] = [];
  for (const [index, value] of raw.entries()) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.expectation !== 'string' || !row.expectation.trim() ||
        typeof row.sourceQuote !== 'string' || !quoteInSource(row.sourceQuote, content)) return null;
    criteria.push({ id: `c${index + 1}`, expectation: row.expectation.trim(), sourceQuote: row.sourceQuote.trim() });
  }
  return criteria;
}

export function buildWrittenReview(
  raw: unknown,
  criteria: QuizCriterion[],
  source: Omit<QuizSourceCitation, 'excerpt'> & { content: string }
): WrittenReview | null {
  if (!Array.isArray(raw) || raw.length !== criteria.length || criteria.length === 0) return null;
  const byId = new Map<string, { awarded: number; reason: string }>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.criterionId !== 'string' || byId.has(row.criterionId) ||
        !criteria.some((c) => c.id === row.criterionId) ||
        typeof row.awarded !== 'number' || ![0, 0.5, 1].includes(row.awarded) ||
        typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 500) return null;
    byId.set(row.criterionId, { awarded: row.awarded, reason: row.reason.trim() });
  }
  const reviews: CriterionReview[] = [];
  for (const criterion of criteria) {
    const grade = byId.get(criterion.id);
    if (!grade || !quoteInSource(criterion.sourceQuote, source.content)) return null;
    const excerpt = extractQuote(criterion.sourceQuote, source.content);
    if (!excerpt) return null;
    reviews.push({
      criterionId: criterion.id,
      expectation: criterion.expectation,
      awarded: grade.awarded,
      possible: 1,
      deducted: 1 - grade.awarded,
      reason: grade.reason,
      source: {
        chunkId: source.chunkId,
        chapterNo: source.chapterNo,
        chapterTitle: source.chapterTitle,
        section: source.section,
        pageFrom: source.pageFrom,
        pageTo: source.pageTo,
        excerpt,
      },
    });
  }
  const totalAwarded = reviews.reduce((sum, item) => sum + item.awarded, 0);
  return {
    correctAnswer: [...new Set(reviews.map((item) => item.source.excerpt))].join('\n\n'),
    criteria: reviews,
    totalAwarded,
    totalPossible: reviews.length,
    totalDeducted: reviews.length - totalAwarded,
  };
}
