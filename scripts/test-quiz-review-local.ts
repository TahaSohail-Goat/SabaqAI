// Opt-in database integration test. No real model/embedding calls and no new account.
// Run with a PRIVATE local env overlay; URL guard refuses every non-loopback database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { explainQuiz, QuizExplainFailure } from '../src/lib/quiz/explain';
import { quizReviewStore } from '../src/lib/quiz/explain-store';
import { fixtureDependencies } from '../tests/ask/fixtures';

async function main() {
  if (!process.argv.includes('--local')) throw new Error('Explicit --local required');
  const root = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://invalid');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(root.hostname) || root.protocol !== 'http:') throw new Error('Only local HTTP Supabase is permitted');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Local service-role configuration required');
  const db = createClient(root.href, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: users, error: userError } = await db.from('users').select('id').limit(1);
  const { data: chapters, error: chapterError } = await db.from('chapters').select('id,board_code,class_level,subject_code,chapter_no')
    .eq('board_code', 'FBISE').eq('class_level', 10).eq('subject_code', 'physics').limit(1);
  if (userError || chapterError || !users?.length || !chapters?.length) throw new Error('An existing local student and Physics 10 chapter are required');
  const userId = users[0].id as string, chapter = chapters[0];
  const { data: quiz, error } = await db.from('quizzes').insert({ user_id: userId, chapter_id: chapter.id }).select('id').single();
  if (error || !quiz) throw new Error('Local fixture quiz could not be created');
  let leaseKey: string | undefined;
  try {
    const { data: question, error: qe } = await db.from('quiz_questions').insert({ quiz_id: quiz.id, position: 1,
      stem: "What does Ohm's law state at constant temperature?", question_type: 'mcq' }).select('id').single();
    if (qe || !question) throw new Error('Fixture question insert failed');
    for (const operation of [
      () => db.from('quiz_options').insert([{ question_id: question.id, option_index: 0, option_text: 'Current is independent of voltage.' }, { question_id: question.id, option_index: 1, option_text: 'Voltage is proportional to current.' }]),
      () => db.from('quiz_answer_keys').insert({ question_id: question.id, correct_option_index: 1 }),
    ]) { const { error: insertError } = await operation(); if (insertError) throw new Error('Fixture options/key insert failed'); }
    const { data: attempt, error: ae } = await db.from('quiz_attempts').insert({ quiz_id: quiz.id, user_id: userId, score: 0, total: 1, answered: 1 }).select('id').single();
    if (ae || !attempt) throw new Error('Fixture attempt insert failed');
    const { error: answerError } = await db.from('quiz_attempt_answers').insert({ attempt_id: attempt.id, question_id: question.id,
      selected_option_index: 0, is_correct: false, points_awarded: 0, points_possible: 1, grading_state: 'graded' });
    if (answerError) throw new Error('Fixture answer/snapshot insert failed; apply migration 0022 locally');
    const base = fixtureDependencies();
    const actualScope = { board: chapter.board_code as string, classLevel: chapter.class_level as number,
      subject: chapter.subject_code as string, chapterNo: chapter.chapter_no as number, sourceType: 'textbook' as const };
    const originalSeeds = base.retrieval.seeds;
    base.retrieval.seeds = async (...args) => (await originalSeeds(...args)).map((seed) => ({ ...seed, ...actualScope }));
    base.retrieval.neighbors = async () => [];
    const json = base.provider.json.bind(base.provider);
    let resume: (() => void) | undefined;
    base.provider.json = async (...args) => {
      if (args[0] === 'explanation') await new Promise<void>((resolve) => { resume = resolve; });
      const result = await json(...args) as Record<string, unknown>;
      return args[0] === 'explanation' ? { ...result, assessment: { verdict: 'consistent', statementIds: ['s1'], responseComparisonIds: ['s1'], expectedAnswerReasonIds: ['s1'] } }
        : { ...result, assessmentVerdict: 'consistent', responseComparisonSupported: true, expectedAnswerReasonSupported: true };
    };
    const real = quizReviewStore(db);
    const store = { ...real, claim: async (...args: Parameters<typeof real.claim>) => { leaseKey = args[0]; return real.claim(...args); } };
    const deps = { ...base, store, authorization: { userId, profile: { board: actualScope.board, classLevel: actualScope.classLevel, subjects: [actualScope.subject] } } };
    const input = { attemptId: attempt.id, questionId: question.id, language: 'en' };
    const start = performance.now();
    const winner = explainQuiz(input, deps);
    // Fail promptly if the real adapter rejects before it reaches the controlled provider.
    let outcome: unknown;
    const settled = winner.then((r) => { outcome = r; }, (e: unknown) => { outcome = e; });
    for (let i = 0; !resume && outcome === undefined && i < 1000; i++) await new Promise((r) => setTimeout(r, 5));
    if (!resume) { await settled; throw new Error('Local winner did not reach the provider fixture'); }
    try {
      // A separate Supabase client/adapter has no shared process-local lease map.
      const secondDb = createClient(root.href, process.env.SUPABASE_SERVICE_ROLE_KEY);
      await assert.rejects(explainQuiz(input, { ...deps, store: quizReviewStore(secondDb) }), (e: unknown) => e instanceof QuizExplainFailure && e.code === 'duplicate_request');
      await assert.rejects(explainQuiz(input, { ...deps, authorization: { ...deps.authorization, userId: randomUUID() } }), (e: unknown) => e instanceof QuizExplainFailure && e.code === 'not_found');
    } finally { resume(); }
    const result = await winner;
    assert.equal(result.status, 'explained');
    assert.equal(base.queries.length, 1);
    assert.equal(base.provider.calls, 2);
    console.info(JSON.stringify({ test: 'LOCAL DB + SYNTHETIC PROVIDER/EVIDENCE', status: result.status,
      latencyMs: Math.round(performance.now() - start), stages: base.trace.durations, generationCalls: base.provider.calls,
      duplicateBlockedAcrossClients: true, foreignOwnerBlocked: true }));
  } finally {
    if (leaseKey) { const { error: cleanupError } = await db.from('quiz_explanation_leases').delete().eq('key', leaseKey).eq('user_id', userId); if (cleanupError) throw new Error('Lease fixture cleanup failed'); }
    const { error: cleanupError } = await db.from('quizzes').delete().eq('id', quiz.id).eq('user_id', userId);
    if (cleanupError) throw new Error('Assessment fixture cleanup failed');
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Local Quiz review test failed'); process.exitCode = 1; });
