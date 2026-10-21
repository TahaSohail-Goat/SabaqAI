// SERVER ONLY: service-role reads are ownership-filtered before private snapshots are loaded.
import type { SupabaseClient } from '@supabase/supabase-js';
import { AskFailure } from '../ask/config';

export interface QuizReviewStore {
  attempt(id: string, userId: string, signal: AbortSignal): Promise<unknown | null>;
  answer(attemptId: string, questionId: string, signal: AbortSignal): Promise<unknown | null>;
  claim(key: string, userId: string, token: string, signal: AbortSignal): Promise<number>;
  finish(key: string, token: string, success: boolean): Promise<void>;
}
export function quizReviewStore(db: SupabaseClient): QuizReviewStore {
  return {
    async attempt(id, userId, signal) {
      const { data, error } = await db.from('quiz_attempts').select('id,user_id,quiz_id,submitted_at,quizzes!inner(user_id)')
        .eq('id', id).eq('user_id', userId).eq('quizzes.user_id', userId).abortSignal(signal).maybeSingle();
      if (error) throw new AskFailure('unavailable', 503, true);
      return data;
    },
    async answer(attemptId, questionId, signal) {
      const { data, error } = await db.from('quiz_attempt_answers')
        .select('question_id,selected_option_index,answer_text,is_correct,points_awarded,points_possible,grading_state,review_snapshot,review_version')
        .eq('attempt_id', attemptId).eq('question_id', questionId).abortSignal(signal).maybeSingle();
      if (error) throw new AskFailure('unavailable', 503, true);
      return data;
    },
    async claim(key, userId, token, signal) {
      const { data, error } = await db.rpc('claim_quiz_explanation', { p_key: key, p_user: userId, p_token: token }).abortSignal(signal);
      if (error || !Number.isInteger(data) || data < 0 || data > 300) throw new AskFailure('unavailable', 503, true);
      return data as number;
    },
    async finish(key, token, success) {
      // Independent short cleanup deadline: a cancelled HTTP caller must still release its lease.
      const { error } = await db.rpc('finish_quiz_explanation', { p_key: key, p_token: token, p_success: success }).abortSignal(AbortSignal.timeout(5000));
      if (error) console.warn('[quiz-explain] lease cleanup failed; lease expires automatically');
    },
  };
}
