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

/** UUID check — the local fallback corpus uses string ids like "pctb-10-phy-ch14-01". Those
 *  aren't database rows, so there's nothing to link in qa_log_chunks; the qa_log row itself
 *  still records the scores. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function logQuestion(entry: QaLogEntry): Promise<void> {
  const supabase = getServiceRoleClient();
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('qa_log')
      .insert({
        user_id: entry.userId ?? null,
        subject_code: entry.subject,
        question_language: entry.questionLanguage,
        top1_score: entry.top1Score,
        support_count: entry.supportCount,
        gate_decision: entry.decision,
        refusal_reason: entry.refusalReason ?? null,
        latency_total_ms: Math.round(entry.latencyMs),
      })
      .select('id')
      .single();

    if (error) {
      console.error('qa_log insert failed:', error.message);
      return;
    }

    // Junction rows: which chunks were retrieved, at what rank and score, and which the answer
    // actually cited. (Schema v2 — v1 stored these as two uuid[] columns and lost rank/score.)
    const cited = new Set(entry.citedChunkIds ?? []);
    const rows = entry.retrievedChunks
      .filter((c) => UUID_RE.test(c.id))
      .map((c, i) => ({
        qa_log_id: data.id as string,
        chunk_id: c.id,
        rank: i + 1,
        score: c.score,
        was_cited: cited.has(c.id),
      }));

    if (rows.length > 0) {
      const { error: linkError } = await supabase.from('qa_log_chunks').insert(rows);
      if (linkError) console.error('qa_log_chunks insert failed:', linkError.message);
    }
  } catch (err) {
    console.error('qa_log insert threw:', err instanceof Error ? err.message : err);
  }
}
