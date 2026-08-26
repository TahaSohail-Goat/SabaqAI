// Citation validation. The model chooses WHICH chunk; it never writes what the citation SAYS.
// Rules (see docs/rag-architecture.md):
//   - Reject any chunk id the model cites that was not retrieved.
//   - Drop statements left with no valid citation.
//   - If more than half the statements are dropped, the answer is ungrounded -> refuse.
//   - Build displayed citations from the retrieved chunk rows, not from model output.

import type { GroundedAnswer, RetrievedChunk, Citation } from '../types';

export interface ValidationResult {
  ok: boolean; // false => refuse with reason 'ungrounded_output'
  statements: { text: string; chunkIds: string[] }[];
  citations: Citation[];
}

export function validateCitations(
  answer: GroundedAnswer,
  retrieved: RetrievedChunk[],
): ValidationResult {
  const retrievedById = new Map(retrieved.map((c) => [c.id, c]));
  const total = answer.statements.length;

  const kept = answer.statements
    .map((s) => ({ ...s, chunkIds: s.chunkIds.filter((id) => retrievedById.has(id)) }))
    .filter((s) => s.chunkIds.length > 0);

  const dropped = total - kept.length;
  if (total === 0 || dropped > total / 2) {
    return { ok: false, statements: [], citations: [] };
  }

  const usedIds = new Set(kept.flatMap((s) => s.chunkIds));
  const citations: Citation[] = [...usedIds].map((id) => {
    const c = retrievedById.get(id)!;
    return {
      chunkId: c.id,
      chapterNo: c.chapterNo,
      chapterTitle: c.chapterTitle,
      section: c.section,
      pageFrom: c.pageFrom,
      pageTo: c.pageTo,
      sourceType: c.sourceType,
      excerpt: c.content.slice(0, 400), // from the DB row, never from the model
    };
  });

  return { ok: true, statements: kept, citations };
}
