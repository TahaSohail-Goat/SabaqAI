// Writes one row per question to qa_log.
//
// docs/database.md: "qa_log — every question: scores, gate decision, which chunks were retrieved
// and cited, latency. This is how you measure refusal rate."
//
// Without this table being populated there is no record of how the system behaved in real use —
// only the offline eval set. Judges ask what happened during the demo; this is the answer.
//
// Logging must NEVER break a request. Every failure here is swallowed and logged: a student losing
// their answer because analytics failed is a far worse outcome than a missing row.

import { getServiceRoleClient } from './supabase/admin';
import type { RetrievedChunk } from './types';

export interface QaLogEntry {
  userId?: string | null;
  subject: string;
  questionLanguage: string;
  top1Score: number;
  supportCount: number;
  decision: 'PASS' | 'BORDERLINE' | 'REFUSE';
  refusalReason?: string | null;
  retrievedChunks: RetrievedChunk[];
  citedChunkIds?: string[];
  latencyMs: number;
}

/** UUID check — the local fallback corpus uses string ids like "pctb-10-phy-ch14-01", and the
 *  qa_log columns are uuid[]. Passing those through would fail the insert. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const onlyUuids = (ids: string[]): string[] => ids.filter((id) => UUID_RE.test(id));

export async function logQuestion(entry: QaLogEntry): Promise<void> {
  const supabase = getServiceRoleClient();
  if (!supabase) return;

  try {
    const retrievedIds = onlyUuids(entry.retrievedChunks.map((c) => c.id));
    const citedIds = onlyUuids(entry.citedChunkIds ?? []);

    const { error } = await supabase.from('qa_log').insert({
      user_id: entry.userId ?? null,
      subject: entry.subject,
      question_language: entry.questionLanguage,
      top1_score: entry.top1Score,
      support_count: entry.supportCount,
      gate_decision: entry.decision,
      refusal_reason: entry.refusalReason ?? null,
      retrieved_chunk_ids: retrievedIds,
      cited_chunk_ids: citedIds,
      latency_total_ms: Math.round(entry.latencyMs),
    });

    if (error) console.error('qa_log insert failed:', error.message);
  } catch (err) {
    console.error('qa_log insert threw:', err instanceof Error ? err.message : err);
  }
}
