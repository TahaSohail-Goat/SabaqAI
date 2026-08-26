// Vector search. ALWAYS filtered by the student's board/class/subject.
// An unfiltered search is a bug — it breaks grounding by pulling the wrong curriculum.

import type { RetrievedChunk } from '../types';
import { INITIAL_SYLLABUS_CHUNKS, CHAPTER_DIRECTORY } from '../syllabus-data';
import { getGeminiClient } from '../gemini';

export interface RetrievalInput {
  normalisedQuery: string;
  board: string;
  classLevel: number;
  subject: string;
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

function calculateKeywordScore(query: string, content: string, keywords: string[]): number {
  const qTerms = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
  if (qTerms.length === 0) return 0.1;

  let termMatches = 0;
  let exactPhraseBonus = 0;
  const contentLower = content.toLowerCase();

  // Check exact phrases
  if (contentLower.includes(query.toLowerCase()) && query.length > 5) {
    exactPhraseBonus += 0.35;
  }

  // Check keywords
  for (const kw of keywords) {
    if (kw.toLowerCase().includes(query.toLowerCase()) || query.toLowerCase().includes(kw.toLowerCase())) {
      exactPhraseBonus += 0.25;
      break;
    }
  }

  // Check individual key terms
  for (const term of qTerms) {
    const regex = new RegExp(`\\b${term}`, 'i');
    if (regex.test(contentLower)) {
      termMatches += 1;
    }
    for (const kw of keywords) {
      if (kw.toLowerCase().includes(term)) {
        termMatches += 0.5;
      }
    }
  }

  const coverage = termMatches / (qTerms.length * 1.5);
  const baseScore = Math.min(0.85, 0.2 + (coverage * 0.5) + exactPhraseBonus);
  return Number(baseScore.toFixed(3));
}

// Cosine similarity for embedding vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function retrieve(input: RetrievalInput): Promise<RetrievedChunk[]> {
  const normQuery = normaliseQueryText(input.normalisedQuery);
  const maxChunks = Number(process.env.CONTEXT_MAX_CHUNKS ?? 6);

  // Filter chunks strictly by board, class level, subject
  const filteredChunks = INITIAL_SYLLABUS_CHUNKS.filter((c) => {
    const boardMatch = c.board.toLowerCase() === input.board.toLowerCase();
    const classMatch = c.classLevel === input.classLevel;
    const subjectMatch = c.subject.toLowerCase() === input.subject.toLowerCase();
    return boardMatch && classMatch && subjectMatch;
  });

  if (filteredChunks.length === 0) {
    return [];
  }

  // Check if Gemini embedding API is available
  const ai = getGeminiClient();
  const scoredChunks: RetrievedChunk[] = [];

  if (ai) {
    try {
      // Generate embedding for query
      const embedModel = process.env.EMBEDDING_MODEL || 'text-embedding-004';
      const embedRes = await ai.models.embedContent({
        model: embedModel,
        contents: normQuery,
      });

      const anyRes = embedRes as any;
      const queryVector: number[] | undefined = anyRes.embedding?.values || anyRes.embeddings?.[0]?.values;

      if (queryVector && queryVector.length > 0) {
        // Embed candidate chunks (or hybrid rank)
        for (const chunk of filteredChunks) {
          const kwScore = calculateKeywordScore(normQuery, chunk.content, chunk.keywords);
          
          // Hybrid score combining semantic keyword relevance with safety
          let score = kwScore;
          try {
            const chunkEmbedRes = await ai.models.embedContent({
              model: embedModel,
              contents: `${chunk.chapterTitle} ${chunk.section} ${chunk.content}`,
            });
            const anyChunkRes = chunkEmbedRes as any;
            const chunkVector: number[] | undefined = anyChunkRes.embedding?.values || anyChunkRes.embeddings?.[0]?.values;
            if (chunkVector) {
              const semSim = (cosineSimilarity(queryVector, chunkVector) + 1) / 2;
              score = Number((0.6 * semSim + 0.4 * kwScore).toFixed(3));
            }
          } catch {
            score = kwScore;
          }

          scoredChunks.push({
            id: chunk.id,
            chapterNo: chunk.chapterNo,
            chapterTitle: chunk.chapterTitle,
            section: chunk.section,
            pageFrom: chunk.pageFrom,
            pageTo: chunk.pageTo,
            sourceType: chunk.sourceType,
            content: chunk.content,
            score: Math.min(0.98, Math.max(0.05, score)),
          });
        }
      }
    } catch {
      // Fallback to calibrated keyword ranking
    }
  }

  if (scoredChunks.length === 0) {
    for (const chunk of filteredChunks) {
      const score = calculateKeywordScore(normQuery, chunk.content, chunk.keywords);
      scoredChunks.push({
        id: chunk.id,
        chapterNo: chunk.chapterNo,
        chapterTitle: chunk.chapterTitle,
        section: chunk.section,
        pageFrom: chunk.pageFrom,
        pageTo: chunk.pageTo,
        sourceType: chunk.sourceType,
        content: chunk.content,
        score: Math.min(0.95, Math.max(0.05, score)),
      });
    }
  }

  // Sort descending by score
  scoredChunks.sort((a, b) => b.score - a.score);

  // Return top CONTEXT_MAX_CHUNKS
  return scoredChunks.slice(0, maxChunks);
}

export function getNearestChapters(subject: string = 'physics'): { chapterNo: number; chapterTitle: string | null; score: number }[] {
  return CHAPTER_DIRECTORY
    .filter(c => c.subject.toLowerCase() === subject.toLowerCase())
    .slice(0, 3)
    .map(c => ({ chapterNo: c.chapterNo, chapterTitle: c.chapterTitle, score: 0.3 }));
}
