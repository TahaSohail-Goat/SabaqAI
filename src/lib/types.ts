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
  sourceType: 'textbook' | 'past_paper' | 'model_paper';
  content: string;
  score: number; // 1 - cosine distance
}

export interface AskScope {
  board: string;
  classLevel: number;
  subject: string;
  sourceType: AskSourceType;
  chapterNo?: number;
}

export interface QuestionUnderstanding {
  status: 'ready' | 'needs_clarification';
  normalizedQuestion: string | null;
  retrievalQuestion: string | null;
  inputLanguage: 'en' | 'ur' | 'roman_ur' | 'mixed' | 'other';
  intent: 'definition' | 'explanation' | 'comparison' | 'mechanism' | 'numerical' | 'derivation' | 'application' | 'example' | 'other';
  concepts: string[];
  corrections: { original: string; replacement: string }[];
  ambiguityReasons: string[];
  clarification: null | {
    question: string;
    options: { id: string; label: string; interpretedQuestion: string }[];
    allowFreeText: true;
  };
}

export interface AskInterpretation {
  originalQuestion: string;
  normalizedQuestion: string;
  retrievalQuestion: string;
}

export interface EvidenceChunk extends Omit<RetrievedChunk, 'score'> {
  score: number | null; // Context neighbors never inherit a seed's similarity.
  board: string;
  classLevel: number;
  subject: string;
  sourceId: string;
  chapterId: string;
  sectionId: string;
  chunkIndex: number;
  sourceLanguage: string;
  role: 'seed' | 'context' | 'condition' | 'example' | 'definition';
}

export interface EvidenceBoundary {
  scope: AskScope;
  sourceIds: string[];
  chapterIds: string[];
  sectionIds: string[];
  evidenceChunkIds: string[];
  coveredAspects: { aspect: string; chunkIds: string[] }[];
  missingRequestedAspects: string[];
  constraints: string[];
  coverage: 'sufficient' | 'partial' | 'insufficient';
  truncated: boolean;
}

export interface TeachingStatement {
  id: string;
  aspect: 'core' | 'definition' | 'mechanism' | 'condition' | 'relationship' | 'formula' | 'comparison' | 'example';
  text: string;
  chunkIds: string[];
  kind: 'explanation' | 'book_example' | 'illustration' | 'derivation';
}

export interface ExplanationBlock {
  kind: 'direct_answer' | 'explanation' | 'example' | 'takeaway';
  statementIds: string[];
}

export interface TeachingAnswer {
  answerable: boolean;
  language: Language;
  coverage: 'sufficient' | 'partial' | 'insufficient';
  statements: TeachingStatement[];
  blocks: ExplanationBlock[];
  missingAspects: string[];
  // New numerical examples are deliberately omitted unless the bounded calculation is checkable.
  calculation: null | {
    statementId: string;
    formulaChunkId: string;
    formula: 'V=I*R' | 'R=V/I' | 'I=V/R';
    inputs: { value: number; unit: 'V' | 'A' | 'ohm'; origin: 'student' | 'book' | 'assumed' }[];
    result: number;
    unit: 'V' | 'A' | 'ohm';
  };
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
      statements: { id?: string; kind?: TeachingStatement['kind']; text: string; chunkIds: string[] }[];
      citations: Citation[];
      notCovered: string | null;
      requestId?: string;
      interpretation?: AskInterpretation;
      blocks?: ExplanationBlock[];
      boundary?: EvidenceBoundary;
      supportReview?: 'model_reviewed' | 'disabled';
    }
  | {
      status: 'refused';
      reason: 'no_candidates' | 'low_similarity' | 'ungrounded_output';
      message: string;
      nearestChapters: { chapterNo: number; chapterTitle: string | null; score: number }[];
      suggestion: string;
      requestId?: string;
      interpretation?: AskInterpretation;
    }
  | {
      status: 'needs_clarification';
      requestId: string;
      originalQuestion: string;
      question: string;
      options: { id: string; label: string }[];
      context: string;
      allowFreeText: true;
    }
  | {
      status: 'error';
      requestId: string;
      code: 'invalid_request' | 'invalid_clarification' | 'rate_limited' | 'configuration' | 'unavailable' | 'invalid_output' | 'timeout';
      message: string;
      retryable: boolean;
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

/** Assessment context is server-loaded, never academic evidence or an HTTP input. */
export interface QuizReviewContext {
  ownerId: string;
  attemptId: string;
  questionId: string;
  version: string;
  scope: AskScope;
  question: string;
  questionType: 'mcq' | 'short' | 'long';
  options: string[];
  response: string;
  expectedAnswer: string;
  credit: 'incorrect' | 'partial';
}

export type GroundedAskResult = AskResponse | {
  status: 'assessment_review';
  explanation: Extract<AskResponse, { status: 'answered' }>;
};

export interface QuizExplainRequest { attemptId: string; questionId: string; language?: Language }
export type QuizExplainIneligible = 'not_submitted' | 'snapshot_unavailable' | 'grading_unavailable' | 'grading_changed' | 'unanswered' | 'correct' | 'unsupported_context';
export type QuizExplainResponse =
  | { status: 'explained' | 'assessment_review'; requestId: string; attemptId: string; questionId: string; explanation: Extract<AskResponse, { status: 'answered' }> }
  | { status: 'insufficient_support'; requestId: string; refusal: Extract<AskResponse, { status: 'refused' }> }
  | { status: 'not_eligible'; requestId: string; reason: QuizExplainIneligible }
  | { status: 'error'; requestId: string; code: 'unauthenticated' | 'forbidden' | 'not_found' | 'duplicate_request' | 'cancelled' | Extract<AskResponse, { status: 'error' }>['code']; message: string; retryable: boolean; retryAfterSeconds?: number };

// /api/ask/options — what a student can actually pick from before asking a question. Always
// returns all four source types, even with an empty units array, so the UI can show an
// honest "nothing ingested yet" state instead of hiding a category outright.
export type AskSourceType = 'textbook' | 'past_paper' | 'model_paper';

// Flat (non-textbook) documents key their `chapters` row on year, not a real chapter number
// (src/lib/crawler/structure/flat-document.ts) — so a past paper and a marking scheme for the
// same board/class/subject/year share one `chapters` row and its one `chapter_title` column.
// Whichever source type was ingested more recently for that year overwrites the stored title
// for BOTH. Every read path that surfaces a title for a non-textbook source (the options
// picker in src/app/api/ask/options/route.ts, and citation display via
// src/lib/ai/retrieval.ts) must derive the label from (sourceType, chapterNo, subject) through
// this one function instead of trusting the stored column — textbooks are exempt since their
// title is genuinely per-chapter and never collides.
const FLAT_SOURCE_LABEL: Record<Exclude<AskSourceType, 'textbook'>, string> = {
  past_paper: 'Past Paper',
  model_paper: 'Model Paper',
};

export function displayChapterTitle(
  sourceType: AskSourceType,
  chapterNo: number,
  storedTitle: string | null,
  subject: string,
): string | null {
  if (sourceType === 'textbook') return storedTitle;
  return `${FLAT_SOURCE_LABEL[sourceType]} ${chapterNo} — ${subject.replace(/_/g, ' ')}`;
}

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

// In-app notifications. Message text is built from persisted events, never model output.
export type NotificationKind = 'exam_reminder' | 'plan_created' | 'quiz_completed';

export interface StudyNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  receivedAt: string;
}

export interface NotificationPreferences {
  examReminders: boolean;
  planUpdates: boolean;
  quizResults: boolean;
  popups: boolean;
}

export interface NotificationInboxResponse {
  items: StudyNotification[];
  unreadCount: number;
  archivedCount: number;
  checkedAt: string;
  totalCount: number;
  hasMore: boolean;
  preferences: NotificationPreferences;
}

export type NotificationActionRequest =
  | { action: 'mark_all_read' }
  | { action: 'read' | 'unread' | 'archive' | 'restore' | 'delete'; id: string }
  | { action: 'archive_many' | 'restore_many' | 'read_many' | 'delete_many'; ids: string[] };
