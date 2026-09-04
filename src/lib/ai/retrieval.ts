// Vector search. ALWAYS filtered by the student's board/class/subject.
// An unfiltered search is a bug — it breaks grounding by pulling the wrong curriculum.
//
// Two paths:
//   1. Supabase configured  -> real pgvector search via the match_content_chunks RPC.
//      One embedding call per question; chunk embeddings were computed once at ingest time.
//   2. Not configured       -> a keyword-ranked fallback over the small hardcoded corpus, so the
//      frontend is workable locally without keys. It is NOT the product and says so loudly.

import { displayChapterTitle, type RetrievedChunk } from '../types';
import { INITIAL_SYLLABUS_CHUNKS } from '../syllabus-data';
import { getServiceRoleClient } from '../supabase/admin';
import { embedText } from './embeddings';

export interface RetrievalInput {
  normalisedQuery: string;
  board: string;
  classLevel: number;
  subject: string;
  /** Narrows to one source (a book, past papers, model papers, marking schemes) and/or one
   *  specific chapter/paper within it. Board+class+subject stay mandatory regardless — this
   *  only ever narrows further, never replaces that filter (AGENTS.md invariant 6). */
  sourceType?: string;
  chapterNo?: number;
}

// Roman Urdu transliteration & normalisation dictionary for Pakistani matric physics
const ROMAN_URDU_MAP: Record<string, string> = {
  'qanoon': 'law',
  'kanoon': 'law',
  'qanoon-e-ohm': "ohm's law",
  'barqi': 'electric',
  'barqi ro': 'electric current',
  'kya hai': 'what is',
  'kia hai': 'what is',
  'ki tareef': 'definition of',
  'bayan karein': 'state and explain',
  'batao': 'explain',
  'muzahimat': 'resistance',
  'hararat': 'heat joule',
  'quwat': 'force power',
  'ro': 'current',
  'volt': 'voltage',
  'mutaasir': 'affecting factors'
};

export function normaliseQueryText(query: string): string {
  let text = query.trim().toLowerCase();
  for (const [roman, replacement] of Object.entries(ROMAN_URDU_MAP)) {
    if (text.includes(roman)) {
      text = text.replace(new RegExp(`\\b${roman}\\b`, 'gi'), replacement);
    }
  }
  return text;
}

export async function retrieve(input: RetrievalInput): Promise<RetrievedChunk[]> {
  const normQuery = normaliseQueryText(input.normalisedQuery);
  const topK = Number(process.env.TOP_K ?? 20);
  const maxChunks = Number(process.env.CONTEXT_MAX_CHUNKS ?? 6);

  const supabase = getServiceRoleClient();

  if (supabase) {
    // Embed the question once. Chunk vectors are already stored — never re-embed the corpus.
    const queryVector = await embedText(normQuery);

    const { data, error } = await supabase.rpc('match_content_chunks', {
      query_embedding: queryVector,
      filter_board: input.board,
      filter_class: input.classLevel,
      filter_subject: input.subject,
      match_count: topK,
      filter_source_type: input.sourceType ?? null,
      filter_chapter_no: input.chapterNo ?? null,
    });

    if (error) {
      // Fail loudly. Returning [] here would look identical to "nothing matched", the gate would
      // refuse, and a broken database would silently masquerade as a working guardrail.
      throw new Error(
        `Vector search failed: ${error.message}. ` +
        `If this mentions the function, run supabase/migrations/0002_match_function.sql.`
      );
    }

    type MatchRow = {
      id: string;
      chapter_no: number;
      chapter_title: string | null;
      section: string | null;
      page_from: number | null;
      page_to: number | null;
      source_type: RetrievedChunk['sourceType'];
      content: string;
      score: number;
    };

    return ((data ?? []) as MatchRow[]).slice(0, maxChunks).map((row) => ({
      id: row.id,
      chapterNo: row.chapter_no,
      chapterTitle: displayChapterTitle(row.source_type, row.chapter_no, row.chapter_title, input.subject),
      section: row.section,
      pageFrom: row.page_from,
      pageTo: row.page_to,
      sourceType: row.source_type,
      content: row.content,
      score: Number(row.score.toFixed(3)),
    }));
  }

  warnFallbackOnce();
  return retrieveFromLocalCorpus(normQuery, input, maxChunks);
}

let warned = false;
function warnFallbackOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    '[retrieval] Supabase is not configured — using the hardcoded local corpus with keyword ' +
    'ranking. Scores are NOT real embedding similarity and thresholds calibrated against them ' +
    'are meaningless. Never demo or quote metrics from this path. See docs/setup.md.'
  );
}

// ---------------------------------------------------------------------------
// Local development fallback. Not the product.
// ---------------------------------------------------------------------------

function retrieveFromLocalCorpus(
  normQuery: string,
  input: RetrievalInput,
  maxChunks: number,
): RetrievedChunk[] {
  const filtered = INITIAL_SYLLABUS_CHUNKS.filter(
    (c) =>
      c.board.toLowerCase() === input.board.toLowerCase() &&
      c.classLevel === input.classLevel &&
      c.subject.toLowerCase() === input.subject.toLowerCase() &&
      (!input.sourceType || c.sourceType === input.sourceType) &&
      (input.chapterNo === undefined || c.chapterNo === input.chapterNo)
  );

  return filtered
    .map((chunk) => ({
      id: chunk.id,
      chapterNo: chunk.chapterNo,
      chapterTitle: chunk.chapterTitle,
      section: chunk.section,
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo,
      sourceType: chunk.sourceType,
      content: chunk.content,
      score: keywordScore(normQuery, chunk.content, chunk.keywords),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);
}

function keywordScore(query: string, content: string, keywords: string[]): number {
  const terms = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return 0.1;

  const contentLower = content.toLowerCase();
  const queryLower = query.toLowerCase();
  let matches = 0;
  let phraseBonus = 0;

  if (queryLower.length > 5 && contentLower.includes(queryLower)) phraseBonus += 0.35;
  if (keywords.some((k) => k.toLowerCase().includes(queryLower) || queryLower.includes(k.toLowerCase()))) {
    phraseBonus += 0.25;
  }

  for (const term of terms) {
    if (new RegExp(`\\b${term}`, 'i').test(contentLower)) matches += 1;
    for (const k of keywords) if (k.toLowerCase().includes(term)) matches += 0.5;
  }

  const coverage = matches / (terms.length * 1.5);
  const score = Math.min(0.85, 0.2 + coverage * 0.5 + phraseBonus);
  return Number(Math.min(0.95, Math.max(0.05, score)).toFixed(3));
}

// ---------------------------------------------------------------------------

// The chapters that came CLOSEST to this question, computed from the scores retrieval actually
// produced. Shown to the student on a refusal.
//
// This must never be a fixed list. "Nearest" has to mean nearest to what was asked, or the
// refusal card is making a claim the system can't back — and that card is the whole demo.
// When retrieval found nothing at all, the honest answer is an empty list, not a guess.
export function getNearestChapters(
  chunks: RetrievedChunk[],
  limit = 3,
): { chapterNo: number; chapterTitle: string | null; score: number }[] {
  const bestPerChapter = new Map<number, { chapterNo: number; chapterTitle: string | null; score: number }>();

  for (const chunk of chunks) {
    const existing = bestPerChapter.get(chunk.chapterNo);
    if (!existing || chunk.score > existing.score) {
      bestPerChapter.set(chunk.chapterNo, {
        chapterNo: chunk.chapterNo,
        chapterTitle: chunk.chapterTitle,
        score: chunk.score,
      });
    }
  }

  return [...bestPerChapter.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
