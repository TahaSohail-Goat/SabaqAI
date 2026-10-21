import { z } from 'zod';
import { getServiceRoleClient } from '../supabase/admin';
import { retrieve } from '../ai/retrieval';
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
  return query;
}

function fromRow(value: unknown, score: number | null): EvidenceChunk {
  const row = joinedRow.parse(value);
  const s = row.sections, source = s.chapter_sources, chapter = source.chapters;
  return {
    id: row.id, content: row.content, score, chapterNo: chapter.chapter_no,
    chapterTitle: displayChapterTitle(source.source_type, chapter.chapter_no, chapter.chapter_title, chapter.subject_code),
    section: s.section_label, pageFrom: s.page_from, pageTo: s.page_to, sourceType: source.source_type,
    board: chapter.board_code, classLevel: chapter.class_level, subject: chapter.subject_code,
    sourceId: source.id, chapterId: chapter.id, sectionId: s.id, chunkIndex: row.chunk_index,
    sourceLanguage: source.language_code, role: score === null ? 'context' : 'seed',
  };
}

export interface AskRetrieval {
  seeds(question: string, scope: AskScope, config: AskConfig, signal: AbortSignal): Promise<EvidenceChunk[]>;
  neighbors(seeds: EvidenceChunk[], scope: AskScope, config: AskConfig, signal: AbortSignal): Promise<EvidenceChunk[]>;
}

export const liveAskRetrieval: AskRetrieval = {
  async seeds(question, scope, config, signal) {
    if (!getServiceRoleClient() || !process.env.EMBEDDING_API_KEY) throw new AskFailure('configuration', 503);
    const scored = await retrieve({ ...scope, normalisedQuery: question, requireLive: true, preserveQuery: true, maxChunks: config.seeds, signal });
    if (!scored.length) return [];
    const { data, error } = await scopedQuery(scope).in('id', scored.map((c) => c.id)).abortSignal(signal);
    if (error) throw new AskFailure('unavailable', 503, true);
    const byId = new Map((data ?? []).map((row) => { const chunk = fromRow(row, null); return [chunk.id, chunk]; }));
    // A stale search/hydration discrepancy is operational, never "nothing in the textbook".
    if (scored.some((c) => !byId.has(c.id))) throw new AskFailure('unavailable', 503, true);
    return scored.map((c) => ({ ...byId.get(c.id)!, score: c.score, role: 'seed' }));
  },
  async neighbors(seeds, scope, config, signal) {
    const chunks: EvidenceChunk[] = [];
    // At most one bounded range per seed, within its actual section and source. No UUID/page
    // arithmetic and no assumption that a later section is about the same concept.
    for (const seed of seeds) {
      checkDeadline(signal);
      if (chunks.length >= config.context) break;
      const { data, error } = await scopedQuery(scope).eq('section_id', seed.sectionId)
        .gte('chunk_index', Math.max(1, seed.chunkIndex - config.neighbors))
        .lte('chunk_index', seed.chunkIndex + config.neighbors)
        .order('chunk_index').limit(2 * config.neighbors + 1).abortSignal(signal);
      if (error) throw new AskFailure('unavailable', 503, true);
      for (const row of data ?? []) {
        const chunk = fromRow(row, null);
        if (chunk.id !== seed.id && chunk.sourceId === seed.sourceId) chunks.push(chunk);
      }
    }
    return chunks;
  },
};

export function eligible(chunk: EvidenceChunk, scope: AskScope) {
  return chunk.board === scope.board && chunk.classLevel === scope.classLevel && chunk.subject === scope.subject
    && chunk.sourceType === scope.sourceType && (scope.chapterNo === undefined || chunk.chapterNo === scope.chapterNo)
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
  for (const seed of [...seeds].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))) {
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

export function assembleEvidence(seeds: EvidenceChunk[], neighbors: EvidenceChunk[], scope: AskScope, concepts: string[], config: AskConfig) {
  const evidence = [...seeds];
  const anchors = words(concepts.join(' '));
  for (const neighbor of neighbors) {
    if (!eligible(neighbor, scope) || neighbor.score !== null || evidence.some((c) => c.id === neighbor.id || overlaps(c.content, neighbor.content))) continue;
    const anchor = seeds.find((s) => s.sourceId === neighbor.sourceId && s.sectionId === neighbor.sectionId && Math.abs(s.chunkIndex - neighbor.chunkIndex) <= config.neighbors);
    if (!anchor) continue;
    // Body relevance is necessary. Heading matches alone cannot admit unrelated neighbors.
    const bodyWords = words(neighbor.content);
    const explicitCondition = /\b(this (?:law|relationship|rule)|it)\b.{0,60}\b(only if|provided|constant|condition|unless)\b/i.test(neighbor.content);
    if (![...anchors].some((w) => bodyWords.has(w)) && !explicitCondition) continue;
    const role = /\b(constant|provided|only if|condition|unless|approximately)\b/i.test(neighbor.content) ? 'condition'
      : /\b(example|for instance)\b/i.test(neighbor.content) ? 'example' : 'context';
    evidence.push({ ...neighbor, role });
  }
  // Keep a seed's explicit qualification next to it, ahead of lower-ranked independent
  // seeds. Otherwise budget reduction would systematically discard conditions first.
  const ordered = seeds.flatMap((seed) => [seed, ...evidence.filter((c) => c.score === null && c.role === 'condition' && c.sectionId === seed.sectionId)]);
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
  return evidence.filter((c): c is EvidenceChunk & { score: number } => c.score !== null).map((c) => ({ ...c, score: c.score }));
}
