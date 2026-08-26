// Shared shapes. Keep these honest — the whole app agrees on them.

export type Language = 'ur' | 'en';
export type InputMode = 'ur' | 'roman_ur' | 'en';
export type GateDecision = 'PASS' | 'BORDERLINE' | 'REFUSE';

export interface RetrievedChunk {
  id: string;
  chapterNo: number;
  chapterTitle: string | null;
  section: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  sourceType: 'textbook' | 'past_paper' | 'marking_scheme';
  content: string;
  score: number; // 1 - cosine distance
}

export interface GuardrailResult {
  decision: GateDecision;
  reason?: 'no_candidates' | 'low_similarity';
  top1: number;
  support: number;
}

// What the LLM must return. We parse against this; we do not scrape prose.
export interface GroundedAnswer {
  answerable: boolean;
  language: Language;
  statements: { text: string; chunkIds: string[] }[];
  notCovered?: string | null;
}

// What the /api/ask route returns to the browser.
export type AskResponse =
  | {
      status: 'answered';
      confidence: { band: 'high' | 'medium'; top1: number; support: number };
      language: Language;
      statements: { text: string; chunkIds: string[] }[];
      citations: Citation[];
      notCovered: string | null;
    }
  | {
      status: 'refused';
      reason: 'no_candidates' | 'low_similarity' | 'ungrounded_output';
      message: string;
      nearestChapters: { chapterNo: number; chapterTitle: string | null; score: number }[];
      suggestion: string;
    };

export interface Citation {
  chunkId: string;
  chapterNo: number;
  chapterTitle: string | null;
  section: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  sourceType: string;
  excerpt: string;
}
