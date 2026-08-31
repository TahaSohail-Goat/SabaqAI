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
  sourceType: 'textbook' | 'past_paper' | 'marking_scheme' | 'model_paper';
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

// Open general-purpose chat (/chat) — a separate, ungrounded feature from /ask. No confidence
// gate, no citation validation; a student's own file (photo, PDF) may be attached per turn.
export interface ChatAttachment {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  name: string;
  dataBase64: string;
}

// One turn of the conversation, as replayed back to the server on every request (there is no
// server-side session). Attachment BYTES are never resent past the turn they were sent in —
// only the name/mimeType survive in history, so a long conversation with several attached
// files doesn't compound into megabytes resent on every later request.
export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  attachmentName?: string;
  attachmentMimeType?: string;
}

// /api/chat's success path is now a raw streamed text body (with the conversation id in an
// X-Conversation-Id header) rather than a JSON envelope — this only covers the pre-stream
// failure cases (auth, validation, missing AI config), which are still plain JSON.
export type ChatResponse = { status: 'error'; message: string };

export type TranscribeResponse =
  | { status: 'ok'; text: string }
  | { status: 'error'; message: string };

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

// /api/ask/options — what a student can actually pick from before asking a question. Always
// returns all four source types, even with an empty units array, so the UI can show an
// honest "nothing ingested yet" state instead of hiding a category outright.
export type AskSourceType = 'textbook' | 'past_paper' | 'model_paper' | 'marking_scheme';

export interface AskUnit {
  chapterNo: number;
  chapterTitle: string | null;
  /** Public URL to the real source PDF in Storage, or null if it hasn't been uploaded (e.g.
   *  not yet backfilled — see scripts/backfill-pdf-storage.ts). Display-only. */
  pdfUrl: string | null;
  /** The absolute page number (in the original source book/paper) that corresponds to page 1
   *  of pdfUrl. Textbook chapters are uploaded as their own rebuilt, per-chapter PDF (see
   *  rebuildChapterPdf in scripts/crawl.ts), so a citation's pageFrom — which is always an
   *  absolute page in the original book — must be re-based against this before it means
   *  anything inside pdfUrl. null when there's no known offset (e.g. model papers, where the
   *  whole original file is uploaded as-is and page numbers already line up 1:1). */
  pageFrom: number | null;
}

export interface AskSourceOption {
  sourceType: AskSourceType;
  units: AskUnit[];
}

export interface AskOptionsResponse {
  board: string;
  classLevel: number;
  subject: string;
  sources: AskSourceOption[];
}

// /api/ask/document — the full ingested content of one selected chapter/paper, for the
// immersive reader on /ask's other half. Real chunk ids (matching Citation.chunkId) so a
// clicked citation can scroll to and highlight its exact origin in place, instead of showing
// a disconnected excerpt card.
export interface AskDocumentChunk {
  id: string;
  content: string;
}

export interface AskDocumentSection {
  sectionLabel: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  chunks: AskDocumentChunk[];
}

export interface AskDocumentResponse {
  chapterNo: number;
  chapterTitle: string | null;
  sourceType: AskSourceType;
  sections: AskDocumentSection[];
}

// /api/explore/overview — a per-subject content summary for the whole board+classLevel in one
// round trip, so /explore can render a "planet" per subject without one request per subject.
// Always includes every subject code, even ones with zero ingested content (same honest-empty
// convention as /api/ask/options) — a subject with nothing ingested still gets a plain, clickable
// book; it just doesn't get the ring/glow that hasTextbook drives.
export interface ExploreSubjectSummary {
  subjectCode: string;
  chapterCount: number;
  hasTextbook: boolean;
  hasModelPaper: boolean;
}

export interface ExploreOverviewResponse {
  board: string;
  classLevel: number;
  subjects: ExploreSubjectSummary[];
}
