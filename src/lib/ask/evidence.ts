import { z } from 'zod';
import { getServiceRoleClient } from '../supabase/admin';
import { embedText } from '../ai/embeddings';
import { searchTerms, timed } from './hybrid';
import { displayChapterTitle, type AskScope, type EvidenceChunk, type EvidenceBoundary, type RetrievedChunk } from '../types';
import { AskFailure, checkDeadline, type AskConfig } from './config';

const joinedRow = z.object({
  id: z.string(), section_id: z.string(), chunk_index: z.number().int().positive(), content: z.string().min(1),
  sections: z.object({
    id: z.string(), source_id: z.string(), section_label: z.string(), position: z.number(),
    page_from: z.number().nullable(), page_to: z.number().nullable(),
    chapter_sources: z.object({
      id: z.string(), chapter_id: z.string(), source_type: z.enum(['textbook', 'past_paper', 'model_paper']), language_code: z.string(),
      chapters: z.object({ id: z.string(), board_code: z.string(), class_level: z.number(), subject_code: z.string(), chapter_no: z.number(), chapter_title: z.string().nullable() }),
    }),
  }),
});
const SELECT = 'id, section_id, chunk_index, content, sections!inner(id, source_id, section_label, position, page_from, page_to, chapter_sources!inner(id, chapter_id, source_type, language_code, chapters!inner(id, board_code, class_level, subject_code, chapter_no, chapter_title)))';

function scopedQuery(scope: AskScope) {
  const db = getServiceRoleClient();
  if (!db) throw new AskFailure('configuration', 503);
  let query = db.from('content_chunks').select(SELECT)
    .eq('sections.chapter_sources.chapters.board_code', scope.board)
    .eq('sections.chapter_sources.chapters.class_level', scope.classLevel)
    .eq('sections.chapter_sources.chapters.subject_code', scope.subject)
    .eq('sections.chapter_sources.source_type', scope.sourceType);
  if (scope.chapterNo !== undefined) query = query.eq('sections.chapter_sources.chapters.chapter_no', scope.chapterNo);
  if (scope.sourceId) query = query.eq('sections.source_id', scope.sourceId);
  return query;
}

function fromRow(value: unknown, score: number | null): EvidenceChunk {
  const row = joinedRow.parse(value);
  const s = row.sections, source = s.chapter_sources, chapter = source.chapters;
  if (row.section_id !== s.id || s.source_id !== source.id || source.chapter_id !== chapter.id)
    throw new AskFailure('invalid_output', 502);
  return {
    id: row.id, content: row.content, score, chapterNo: chapter.chapter_no,
    chapterTitle: displayChapterTitle(source.source_type, chapter.chapter_no, chapter.chapter_title, chapter.subject_code),
    section: s.section_label, pageFrom: s.page_from, pageTo: s.page_to, sourceType: source.source_type,
    board: chapter.board_code, classLevel: chapter.class_level, subject: chapter.subject_code,
    sourceId: source.id, chapterId: chapter.id, sectionId: s.id, chunkIndex: row.chunk_index,
    sourceLanguage: source.language_code, role: score === null ? 'context' : 'seed',
  };
}

export async function readSourceDocument(scope: AskScope, signal: AbortSignal) {
  const verified = await resolveSourceScope(scope, signal);
  const { data, error } = await scopedQuery(verified).order('chunk_index').abortSignal(signal);
  if (error) throw new AskFailure('unavailable', 503, true);
  const chunks = (data ?? []).map((row) => fromRow(row, null));
  if (chunks.some((c) => !eligible(c, verified))) throw new AskFailure('invalid_output', 502);
  return chunks.sort((a, b) => (a.pageFrom ?? 0) - (b.pageFrom ?? 0) || a.chunkIndex - b.chunkIndex);
}

export async function resolveSourceScope(scope: AskScope, signal: AbortSignal): Promise<AskScope> {
  const db = getServiceRoleClient();
  if (!db) throw new AskFailure('configuration', 503);
  let query = db.from('chapter_sources').select('id, chapters!inner(board_code, class_level, subject_code, chapter_no)')
    .eq('source_type', scope.sourceType).eq('chapters.board_code', scope.board)
    .eq('chapters.class_level', scope.classLevel).eq('chapters.subject_code', scope.subject);
  if (scope.sourceId) query = query.eq('id', scope.sourceId);
  if (scope.chapterNo !== undefined) query = query.eq('chapters.chapter_no', scope.chapterNo);
  const { data, error } = await query.limit(2).abortSignal(signal);
  if (error) throw new AskFailure('unavailable', 503, true);
  // Older clients may omit identity only when the permitted source is unambiguous.
  if (data?.length !== 1) throw new AskFailure('invalid_request', 400);
  return { ...scope, sourceId: z.uuid().parse(data[0].id) };
}

export interface AskRetrieval {
  seeds(question: string, scope: AskScope, config: AskConfig, signal: AbortSignal, hints?: { concepts: string[]; durations: Record<string, number>; allowUnselectedSource?: boolean }): Promise<EvidenceChunk[]>;
  neighbors(seeds: EvidenceChunk[], scope: AskScope, config: AskConfig, signal: AbortSignal): Promise<EvidenceChunk[]>;
}

export function neighborRanges(seeds: EvidenceChunk[], window: number) {
  const ranges: { seed: EvidenceChunk; low: number; high: number }[] = [];
  if (!window) return ranges;
  for (const seed of [...seeds].sort((a, b) => a.sectionId.localeCompare(b.sectionId) || a.chunkIndex - b.chunkIndex)) {
    const low = Math.max(1, seed.chunkIndex - window), high = seed.chunkIndex + window;
    const prior = ranges.at(-1);
    if (prior && prior.seed.sourceId === seed.sourceId && prior.seed.sectionId === seed.sectionId && low <= prior.high + 1)
      prior.high = Math.max(prior.high, high);
    else ranges.push({ seed, low, high });
  }
  return ranges;
}

export const liveAskRetrieval: AskRetrieval = {
  async seeds(question, scope, config, signal, hints) {
    const db = getServiceRoleClient();
    if (!db || !process.env.EMBEDDING_API_KEY) throw new AskFailure('configuration', 503);
    const topK = Number(process.env.TOP_K ?? 20);
    if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new AskFailure('configuration', 503);
    // Legacy Quiz snapshots identify a chapter, not a picked book. Preserve their existing
    // one-actual-source-per-chapter selection. Only the internal Quiz adapter can opt into it.
    if (scope.sourceId || !hints?.allowUnselectedSource)
      scope = await timed(hints?.durations, 'source_validation', () => resolveSourceScope(scope, signal));
    const vector = await timed(hints?.durations, 'embedding', () => embedText(question, { task: 'retrieval.query', signal }));
    const result = await timed(hints?.durations, 'hybrid_search', () => db.rpc('search_ask_hybrid', {
      query_embedding: vector, search_terms: searchTerms(question, hints?.concepts ?? []),
      filter_board: scope.board, filter_class: scope.classLevel, filter_subject: scope.subject,
      filter_source_type: scope.sourceType, filter_chapter_no: scope.chapterNo ?? null,
      filter_source_id: scope.sourceId ?? null, match_count: topK,
    }).abortSignal(signal));
    if (result.error) throw new AskFailure('unavailable', 503, true);
    const scored = z.array(z.object({ id: z.string(), score: z.number().finite().min(-1).max(1), retrieval_rank: z.number().int().positive() })).max(topK * 2).parse(result.data);
    if (!scored.length) return [];
    const { data, error } = await timed(hints?.durations, 'hydration', () => scopedQuery(scope).in('id', scored.map((c) => c.id)).abortSignal(signal));
    if (error) throw new AskFailure('unavailable', 503, true);
    const byId = new Map((data ?? []).map((row) => { const chunk = fromRow(row, null); return [chunk.id, chunk]; }));
    if ([...byId.values()].some((c) => !eligible(c, scope))) throw new AskFailure('invalid_output', 502);
    // A stale search/hydration discrepancy is operational, never "nothing in the textbook".
    if (scored.some((c) => !byId.has(c.id))) throw new AskFailure('unavailable', 503, true);
    return scored.map((c) => ({ ...byId.get(c.id)!, score: c.score, selectionRank: c.retrieval_rank, role: 'seed' }));
  },
  async neighbors(seeds, scope, config, signal) {
    const chunks: EvidenceChunk[] = [];
    // At most one bounded range per seed, within its actual section and source. No UUID/page
    // arithmetic and no assumption that a later section is about the same concept.
    const seedIds = new Set(seeds.map((s) => s.id));
    for (const { seed, low, high } of neighborRanges(seeds, config.neighbors)) {
      checkDeadline(signal);
      if (chunks.length >= config.context) break;
      const { data, error } = await scopedQuery(scope).eq('section_id', seed.sectionId)
        .eq('sections.source_id', seed.sourceId).gte('chunk_index', low).lte('chunk_index', high)
        .order('chunk_index').limit(high - low + 1).abortSignal(signal);
      if (error) throw new AskFailure('unavailable', 503, true);
      for (const row of data ?? []) {
        const chunk = fromRow(row, null);
        if (!seedIds.has(chunk.id) && chunk.sourceId === seed.sourceId && eligible(chunk, scope)) chunks.push(chunk);
      }
    }
    return chunks;
  },
};

export function eligible(chunk: EvidenceChunk, scope: AskScope) {
  return chunk.board === scope.board && chunk.classLevel === scope.classLevel && chunk.subject === scope.subject
    && chunk.sourceType === scope.sourceType && (scope.chapterNo === undefined || chunk.chapterNo === scope.chapterNo)
    && (!scope.sourceId || chunk.sourceId === scope.sourceId)
    && Boolean(chunk.sourceId && chunk.chapterId && chunk.sectionId && chunk.chunkIndex > 0 && chunk.content.trim());
}

const words = (s: string) => new Set(s.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu) ?? []);
export function overlaps(a: string, b: string): boolean {
  const left = words(a), right = words(b);
  if (!left.size || !right.size) return true;
  const shared = [...left].filter((w) => right.has(w)).length;
  return shared / Math.min(left.size, right.size) > 0.85;
}

export function independentSeeds(seeds: EvidenceChunk[], scope: AskScope): EvidenceChunk[] {
  const kept: EvidenceChunk[] = [];
  const sourcePerChapter = new Map<string, string>();
  for (const seed of [...seeds].sort((a, b) => (a.selectionRank ?? Infinity) - (b.selectionRank ?? Infinity) || (b.score ?? -Infinity) - (a.score ?? -Infinity))) {
    if (!eligible(seed, scope) || seed.score === null || !Number.isFinite(seed.score) || seed.score < -1 || seed.score > 1) throw new AskFailure('invalid_output', 502);
    // Keep language/edition identities separate per chapter. Metadata currently has no edition
    // field; do not invent an edition preference or blend duplicate language sources.
    const source = sourcePerChapter.get(seed.chapterId);
    if (source && source !== seed.sourceId) continue;
    if (kept.some((c) => c.id === seed.id || overlaps(c.content, seed.content))) continue;
    sourcePerChapter.set(seed.chapterId, seed.sourceId);
    kept.push(seed);
  }
  return kept;
}

export function assembleEvidence(seeds: EvidenceChunk[], neighbors: EvidenceChunk[], scope: AskScope, concepts: string[], config: AskConfig, question = '') {
  const evidence = [...seeds];
  const anchors = new Set(searchTerms(question, concepts));
  for (const neighbor of neighbors) {
    if (!eligible(neighbor, scope) || neighbor.score !== null || evidence.some((c) => c.id === neighbor.id || overlaps(c.content, neighbor.content))) continue;
    const anchor = seeds.find((s) => s.sourceId === neighbor.sourceId && s.sectionId === neighbor.sectionId && Math.abs(s.chunkIndex - neighbor.chunkIndex) <= config.neighbors);
    if (!anchor) continue;
    // Body relevance is necessary. Heading matches alone cannot admit unrelated neighbors.
    const explicitCondition = /\b(this (?:law|relationship|rule)|it)\b.{0,60}\b(only if|provided|constant|condition|unless)\b/i.test(neighbor.content);
    const relationship = /\b(because|therefore|hence|depends?|proportional|increas\w*|decreas\w*|remain\w*|constant|provided|only if|condition|unless|caus\w*|convert\w*|used to|rather than|instead|while)\b/i;
    const relatedSentence = neighbor.content.split(/(?<=[.!?۔])\s+|\n+/u).some((sentence) => {
      const bodyWords = words(sentence), hits = [...anchors].filter((w) => bodyWords.has(w)).length;
      return (hits >= 1 && relationship.test(sentence)) || (hits >= 2 && /\b(example|for instance)\b/i.test(sentence));
    });
    // A single shared keyword is not enough. Relational/conditional prose must connect
    // to an anchor, or a local anaphoric condition must qualify the seed explicitly.
    if (!relatedSentence && !explicitCondition) continue;
    const role = /\b(constant|provided|only if|condition|unless|approximately)\b/i.test(neighbor.content) ? 'condition'
      : /\b(example|for instance)\b/i.test(neighbor.content) ? 'example' : 'context';
    evidence.push({ ...neighbor, role });
  }
  // Keep a seed's explicit qualification next to it, ahead of lower-ranked independent
  // seeds. Otherwise budget reduction would systematically discard conditions first.
  const ordered = seeds.flatMap((seed) => [seed, ...evidence.filter((c) => c.score === null && c.role === 'condition' && c.sectionId === seed.sectionId && Math.abs(c.chunkIndex - seed.chunkIndex) <= config.neighbors)]);
  const seen = new Set<string>();
  const prioritized = [...ordered, ...evidence].filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
  let truncated = prioritized.length > config.context;
  const bounded = prioritized.slice(0, config.context);
  // A byte ceiling bounds the token-count request itself; it is NOT a token estimate.
  // The adapter measures the exact selected prompt and can reduce it once before generation.
  const byteLimit = config.tokens * 6;
  while (bounded.length && Buffer.byteLength(JSON.stringify(bounded), 'utf8') > byteLimit) {
    bounded.pop(); truncated = true;
  }
  return { evidence: bounded, truncated };
}

export function makeBoundary(scope: AskScope, evidence: EvidenceChunk[], truncated: boolean): EvidenceBoundary {
  const unique = (values: string[]) => [...new Set(values)];
  return {
    scope, sourceIds: unique(evidence.map((c) => c.sourceId)), chapterIds: unique(evidence.map((c) => c.chapterId)),
    sectionIds: unique(evidence.map((c) => c.sectionId)), evidenceChunkIds: evidence.map((c) => c.id),
    coveredAspects: [], missingRequestedAspects: [], coverage: evidence.length ? 'partial' : 'insufficient', truncated,
    constraints: [
      'Coverage describes retrieved passages, not the entire book. Academic coverage is checked after generation.',
      'Context expansion is limited to relevant chunks in the same stored section. One source language per chapter.',
      'Pages are stored section ranges; unknown pages remain unknown.',
      ...(scope.sourceType === 'textbook' ? [] : ['The selected source is an exam paper, not a complete teaching chapter.']),
      ...(truncated ? ['The context budget excluded lower-priority passages.'] : []),
    ],
  };
}

export function scoredEvidence(evidence: EvidenceChunk[]): RetrievedChunk[] {
  return evidence.filter((c): c is EvidenceChunk & { score: number } => c.score !== null).map((c) => ({ ...c, score: c.score })).sort((a, b) => b.score - a.score);
}
