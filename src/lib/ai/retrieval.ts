// Vector search. ALWAYS filtered by the student's board/class/subject.
// An unfiltered search is a bug — it breaks grounding by pulling the wrong curriculum.
// TODO (AI Studio, Day 2-3): implement embedQuery() and the Supabase RPC / query.

import type { RetrievedChunk } from '../types';

export interface RetrievalInput {
  normalisedQuery: string;
  board: string;
  classLevel: number;
  subject: string;
}

export async function retrieve(_input: RetrievalInput): Promise<RetrievedChunk[]> {
  // 1. const vector = await embedQuery(_input.normalisedQuery)
  // 2. Query content_chunks filtered by board/class/subject, order by embedding <=> vector,
  //    limit TOP_K. Use a Postgres function (match_content_chunks) or the JS client.
  // 3. Map rows to RetrievedChunk with score = 1 - distance.
  // 4. Drop near-duplicates, keep the best CONTEXT_MAX_CHUNKS.
  throw new Error('retrieve() not implemented — build on Day 2/3');
}
