import test from 'node:test';
import assert from 'node:assert/strict';
import type { TeachingAnswer, EvidenceChunk } from '../../src/lib/types';
import type { SupportReview } from '../../src/lib/ask/contracts';
import { runAsk } from '../../src/lib/ask/orchestrator';
import { checkReview } from '../../src/lib/ask/validation';
import { AskFailure } from '../../src/lib/ask/config';
import { withinDeadline } from '../../src/lib/ask/limits';
import { fixtureDependencies, fixtureAdequacy, ready, seed, scope, answer as fullAnswer } from './fixtures';
import recorded from './non-contact-evidence.json';
import live from './adequacy-live-recordings.json';
import beforeReview from './definition-only-review-recording.json';

const definition = (): TeachingAnswer => ({ ...fullAnswer(), statements: [{ ...fullAnswer().statements[0],
  aspect: 'definition', text: "Ohm's law states V = IR for a conductor at constant temperature." }],
  blocks: [{ kind: 'direct_answer', statementIds: ['s1'] }] });
type AdequacyInput = Omit<SupportReview['adequacy'], 'reasoning' | 'example'> & Partial<Pick<SupportReview['adequacy'], 'reasoning' | 'example'>>;
const incomplete = { verdict: 'inadequate' as const, reason: 'A definition does not explain the requested relationship or illustrate it.',
  missingAspects: ['Connected explanation of the voltage-current relationship'], repairEvidence: [{ chunkId: seed.id, quote: seed.content }] };
function review(answer: TeachingAnswer, adequacy: AdequacyInput = fixtureAdequacy(answer)): SupportReview {
  return { coherent: true, coreSupported: true, adequacy: { reasoning: 'addressed', example: 'not_needed', ...adequacy }, verdicts: answer.statements.map((s) => ({
    statementId: s.id, verdict: 'supported', chunkIds: s.chunkIds, reason: 'TEST fixture factual support.' })) };
}
function scenario(question: string, first = definition(), adequacy: AdequacyInput = incomplete, options: { skipUnderstanding?: boolean; repaired?: TeachingAnswer; secondAdequacy?: AdequacyInput } = {}) {
  const deps = fixtureDependencies({ understanding: ready(question) });
  deps.config.understanding = !options.skipUnderstanding;
  const stages: string[] = [], outputs: TeachingAnswer[] = [], reviewAnswers: TeachingAnswer[] = [];
  let reviews = 0;
  const original = deps.provider.json;
  deps.provider.json = async (stage, instruction, payload, schema) => {
    stages.push(stage);
    if (stage === 'explanation') { outputs.push(first); return structuredClone(first); }
    if (stage === 'repair') { const repaired = options.repaired ?? fullAnswer(); outputs.push(repaired); return structuredClone(repaired); }
    if (stage === 'review') {
      const current = (payload as { answer: TeachingAnswer }).answer;
      reviewAnswers.push(structuredClone(current));
      return review(current, reviews++ ? options.secondAdequacy ?? fixtureAdequacy(current) : adequacy);
    }
    return original(stage, instruction, payload, schema);
  };
  return { deps, stages, outputs, reviewAnswers, request: { ...scope, question, language: 'en' } };
}

test('grounded definition-only output cannot be presented as a complete how answer', async () => {
  const f = scenario("How does Ohm's law relate voltage to current? Give an illustration.");
  f.deps.config.calls = 4;
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.deps.trace.adequacy, 'inadequate');
  assert.equal(f.deps.trace.supportRejections, 0);
  assert.equal(f.deps.trace.repairSkipped, 'budget');
  assert.deepEqual(f.stages, ['understanding', 'explanation', 'review']);
});

test('normal uncertain-evidence flow can reserve the last two of six calls for one verified repair', async () => {
  const f = scenario('How is voltage related to current?', definition(), incomplete);
  f.deps.retrieval.seeds = async () => [{ ...seed, score: 0.3 }];
  const original = f.deps.provider.json;
  f.deps.provider.json = async (...args) => args[0] === 'sufficiency'
    ? { coverage: 'sufficient', coreSupported: true, support: [{ chunkId: seed.id, quote: seed.content }], missingAspects: [] }
    : original(...args);
  assert.equal((await runAsk(f.request, f.deps)).status, 'answered');
  assert.equal(f.deps.trace.repairs, 1);
  assert.equal(f.deps.config.calls, 6);
  assert.equal(f.reviewAnswers.length, 2);
});

test('an explicit five-call cap cannot start a repair that would leave the answer unreviewed', async () => {
  const f = scenario('How is voltage related to current?', definition(), incomplete);
  f.deps.config.calls = 5;
  f.deps.retrieval.seeds = async () => [{ ...seed, score: 0.3 }];
  const original = f.deps.provider.json;
  f.deps.provider.json = async (...args) => args[0] === 'sufficiency'
    ? { coverage: 'sufficient', coreSupported: true, support: [{ chunkId: seed.id, quote: seed.content }], missingAspects: [] }
    : original(...args);
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.deps.trace.repairSkipped, 'budget');
  assert.equal(f.stages.includes('repair'), false);
});

test('a sufficient short definition answer to a definition question needs no extra prose or call', async () => {
  const first = definition(), f = scenario("What is Ohm's law?", first, fixtureAdequacy(first));
  const result = await runAsk(f.request, f.deps);
  if (result.status !== 'answered') assert.fail();
  assert.equal(result.statements.length, 1);
  assert.equal(result.boundary?.coverage, 'sufficient');
  assert.deepEqual(f.stages, ['understanding', 'explanation', 'review']);
});

test('a complete review label cannot override a definition-only how answer', async () => {
  const first = definition(), f = scenario('How does this relationship work?', first, fixtureAdequacy(first));
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.deps.trace.adequacy, 'inadequate');
});

test('a repeated definition is also inadequate for a why question', async () => {
  const first = definition(), f = scenario('Why does current change when voltage changes?', first, fixtureAdequacy(first));
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.deps.trace.adequacy, 'inadequate');
});

test('definition-only how output cannot escape adequacy as a partial answer', async () => {
  const f = scenario('How does this relationship work?', definition(), { verdict: 'partial',
    reason: 'Only a definition was returned.', missingAspects: ['Mechanism'], repairEvidence: [] });
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.deps.trace.adequacy, 'inadequate');
});

test('a genuine definition request phrased with how can still be concise and adequate', async () => {
  const f = scenario("How is Ohm's law defined?", definition(), fixtureAdequacy(definition()));
  const original = f.deps.provider.json;
  f.deps.provider.json = async (...args) => args[0] === 'understanding' ? { ...ready(f.request.question), intent: 'definition' } : original(...args);
  assert.equal((await runAsk(f.request, f.deps)).status, 'answered');
});

test('supported reasoning and a useful example satisfy grounding and adequacy in the same review', async () => {
  const first = fullAnswer(), f = scenario('Explain the voltage-current relationship with an illustration.', first, fixtureAdequacy(first));
  assert.equal((await runAsk(f.request, f.deps)).status, 'answered');
  assert.equal(f.deps.trace.adequacy, 'complete');
  assert.equal(f.stages.filter((stage) => stage === 'review').length, 1);
});

test('an omitted source-present example cannot be accepted merely because the review says complete', async () => {
  const f = scenario('How is voltage related to current?', fullAnswer(), {
    ...fixtureAdequacy(), verdict: 'complete', example: 'available_but_missing',
  });
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.deps.trace.adequacy, 'inadequate');
});

test('missing-evidence reasoning cannot silently retain a complete adequacy label', () => {
  const checked = checkReview(review(fullAnswer(), { ...fixtureAdequacy(), reasoning: 'missing_evidence' }), fullAnswer(), [seed]);
  assert.equal(checked.adequacy.verdict, 'partial');
  assert.ok(checked.adequacy.missingAspects.length);
});

test('explicit omissions override a partial summary without discarding valid evidence-backed repair', () => {
  const checked = checkReview(review(definition(), { ...incomplete, verdict: 'partial', reasoning: 'omitted', example: 'available_but_missing' }), definition(), [seed]);
  assert.equal(checked.adequacy.verdict, 'inadequate');
  assert.equal(checked.adequacy.repairEvidence[0].quote, seed.content);
});

test('reported non-contact question with only meaning/examples evidence is useful partial, never complete', async () => {
  const row = recorded.evidence[1] as EvidenceChunk;
  const answer: TeachingAnswer = { answerable: true, language: 'en', coverage: 'sufficient', calculation: null,
    statements: [
      { id: 's1', kind: 'explanation', aspect: 'definition', text: 'Non-contact forces act at a distance without the objects touching.', chunkIds: [row.id] },
      { id: 's2', kind: 'book_example', aspect: 'example', text: 'Earth attracting the Moon and repulsion between two north magnetic poles are textbook examples.', chunkIds: [row.id] },
    ], blocks: [{ kind: 'direct_answer', statementIds: ['s1'] }, { kind: 'example', statementIds: ['s2'] }], missingAspects: [] };
  const deps = fixtureDependencies({ understanding: ready('How do non-contact forces work?'), seeds: [{ ...row, score: 0.8 }], neighbors: [], output: answer,
    review: review(answer, { verdict: 'partial', reason: 'Meaning and examples are useful; the underlying mechanism is not established by this answer.', missingAspects: ['Underlying mechanism of action at a distance'], repairEvidence: [] }) });
  const result = await runAsk({ board: row.board, classLevel: row.classLevel, subject: row.subject, sourceType: row.sourceType, chapterNo: row.chapterNo, sourceId: row.sourceId, language: 'en', question: 'how non contact forces work?' }, deps);
  if (result.status !== 'answered') assert.fail();
  assert.equal(result.boundary?.coverage, 'partial');
  assert.match(result.notCovered!, /mechanism/);
  assert.equal(result.citations[0].pageFrom, 63);
  assert.equal(result.boundary?.scope.sourceId, row.sourceId);
});

test('multipart omissions cannot silently remain complete', async () => {
  const f = scenario("State Ohm's law and derive it from the Drude model.", definition(), {
    verdict: 'partial', reason: 'The definition is useful; the requested derivation is unsupported.', missingAspects: ['Drude-model derivation'], repairEvidence: [] });
  const result = await runAsk(f.request, f.deps);
  if (result.status !== 'answered') assert.fail();
  assert.equal(result.boundary?.coverage, 'partial');
  assert.match(result.notCovered!, /Drude/);
  assert.equal(f.stages.includes('repair'), false);
});

test('single requested mechanism missing from the evidence cannot be repaired by inventing it', async () => {
  const f = scenario('Derive a quantum mechanism for this relationship.', definition(), { ...incomplete, repairEvidence: [] }, { skipUnderstanding: true });
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.deps.trace.repairSkipped, 'no_evidence');
  assert.equal(f.stages.includes('repair'), false);
});

test('one inadequacy repair with two reserved slots is revalidated and independently reviewed', async () => {
  const f = scenario('How is voltage related to current?', definition(), incomplete, { skipUnderstanding: true });
  const result = await runAsk(f.request, f.deps);
  if (result.status !== 'answered') assert.fail();
  assert.deepEqual(f.stages, ['explanation', 'review', 'repair', 'review']);
  assert.equal(f.deps.trace.repairs, 1);
  assert.equal(f.reviewAnswers.length, 2);
  assert.equal(f.reviewAnswers[1].statements.length, fullAnswer().statements.length);
  assert.equal(typeof f.deps.trace.durations.repair_token_count, 'number');
  assert.equal(typeof f.deps.trace.durations.support_review_after_repair, 'number');
});

test('an inadequate repair is never repeated or returned as a supported answer', async () => {
  const f = scenario('How is voltage related to current?', definition(), incomplete, { skipUnderstanding: true, repaired: definition(), secondAdequacy: incomplete });
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.stages.filter((s) => s === 'repair').length, 1);
  assert.equal(f.deps.trace.repairSkipped, 'already_repaired');
});

test('a repair with fabricated citations is refused before any further review', async () => {
  const repaired = fullAnswer(); repaired.statements[0].chunkIds = ['fabricated'];
  const f = scenario('How is voltage related to current?', definition(), incomplete, { skipUnderstanding: true, repaired });
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.deepEqual(f.stages, ['explanation', 'review', 'repair']);
});

test('fluent unsupported claims cannot be rescued by a favorable adequacy verdict', async () => {
  const f = scenario('How is voltage related to current?', fullAnswer(), fixtureAdequacy(), { skipUnderstanding: true });
  const original = f.deps.provider.json;
  f.deps.provider.json = async (...args) => args[0] === 'review'
    ? { ...review(fullAnswer()), coreSupported: false, verdicts: review(fullAnswer()).verdicts.map((v) => ({ ...v, verdict: 'unsupported' })) }
    : original(...args);
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(f.deps.trace.repairs, 0);
});

test('repaired claims undergo a fresh grounding check even if adequacy is favorable', async () => {
  const f = scenario('How is voltage related to current?', definition(), incomplete, { skipUnderstanding: true });
  const original = f.deps.provider.json;
  let reviews = 0;
  f.deps.provider.json = async (...args) => {
    if (args[0] === 'review' && ++reviews === 2) return { ...review(fullAnswer()), coreSupported: false };
    return original(...args);
  };
  assert.equal((await runAsk(f.request, f.deps)).status, 'refused');
  assert.equal(reviews, 2);
});

test('invented or paraphrased repair evidence and missing adequacy fail closed', () => {
  for (const repairEvidence of [[{ chunkId: 'foreign-source', quote: seed.content }], [{ chunkId: seed.id, quote: 'An invented mechanism not stored in any retrieved textbook passage.' }]])
    assert.throws(() => checkReview(review(definition(), { ...incomplete, repairEvidence }), definition(), [seed]));
  const { adequacy: _, ...legacy } = review(definition());
  assert.throws(() => checkReview(legacy, definition(), [seed]));
});

test('historical live review without explicit reasoning/example checks fails the new contract', () => {
  assert.equal(beforeReview.review.coreSupported, true);
  assert.equal(beforeReview.review.adequacy.verdict, 'partial');
  assert.throws(() => checkReview(beforeReview.review, beforeReview.before as TeachingAnswer, recorded.evidence as EvidenceChunk[]));
});

test('repair deadline exhaustion cannot return the draft or skip the new review', async () => {
  const f = scenario('How is voltage related to current?', definition(), incomplete, { skipUnderstanding: true });
  const controller = new AbortController(); f.deps.signal = controller.signal;
  const original = f.deps.provider.json;
  f.deps.provider.json = async (...args) => {
    if (args[0] === 'repair') { controller.abort(); return new Promise<never>(() => {}); }
    return original(...args);
  };
  await assert.rejects(withinDeadline(runAsk(f.request, f.deps), controller.signal), (error: unknown) => error instanceof AskFailure && error.code === 'timeout');
  assert.equal(f.reviewAnswers.length, 1);
});

test('provider error during repair cannot synthesize an answer', async () => {
  const f = scenario('How is voltage related to current?', definition(), incomplete, { skipUnderstanding: true });
  const original = f.deps.provider.json;
  f.deps.provider.json = async (...args) => { if (args[0] === 'repair') throw new Error('TEST unavailable'); return original(...args); };
  await assert.rejects(runAsk(f.request, f.deps));
  assert.equal(f.reviewAnswers.length, 1);
});

for (const recording of live.cases) test(`offline replay of new live adequacy contract: ${recording.id}`, async () => {
  const row = recorded.evidence[1];
  const deps = fixtureDependencies({ seeds: recorded.evidence as EvidenceChunk[], neighbors: [] });
  let calls = 0;
  deps.provider.json = async (stage) => {
    const value = recording.providerOutputs[calls++];
    assert.equal(stage, value.stage);
    return structuredClone(value.output);
  };
  if (recording.expected === 'error') {
    await assert.rejects(runAsk({ board: row.board, classLevel: row.classLevel, subject: row.subject,
      chapterNo: row.chapterNo, sourceId: row.sourceId, sourceType: row.sourceType,
      question: recording.question, language: 'en' }, deps));
    assert.equal(calls, recording.providerOutputs.length);
    return;
  }
  const result = await runAsk({ board: row.board, classLevel: row.classLevel, subject: row.subject,
    chapterNo: row.chapterNo, sourceId: row.sourceId, sourceType: row.sourceType,
    question: recording.question, language: 'en' }, deps);
  const actual = result.status === 'answered' && result.boundary?.coverage === 'partial' ? 'partial' : result.status;
  assert.equal(actual, recording.expected);
  assert.equal(calls, recording.providerOutputs.length);
});
