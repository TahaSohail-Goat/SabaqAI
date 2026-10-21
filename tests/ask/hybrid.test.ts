import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTerms } from '../../src/lib/ask/hybrid';
import { assembleEvidence, independentSeeds, scoredEvidence, neighborRanges } from '../../src/lib/ask/evidence';
import { runAsk } from '../../src/lib/ask/orchestrator';
import { preservationFailures } from '../../src/lib/ask/preservation';
import { askRequestSchema } from '../../src/lib/ask/contracts';
import { issueClarification, resumeClarification } from '../../src/lib/ask/clarification';
import { readAskConfig } from '../../src/lib/ask/config';
import { evaluateConfidence } from '../../src/lib/ai/guardrail';
import { fixtureDependencies, request, ready, seed, neighbor, scope, ambiguous } from './fixtures';

test('typo-heavy boiling question retains negation, continued heating and full retrieval wording in one understanding call', async () => {
  const original = 'why temprature dont increse during boilng even we keep heating?';
  const corrected = 'Why does temperature not increase during boiling even when we keep heating?';
  const deps = fixtureDependencies({ understanding: { ...ready(corrected), concepts: ['boiling', 'temperature', 'heating'] } });
  let hints: string[] = [];
  const originalSeeds = deps.retrieval.seeds;
  deps.retrieval.seeds = async (...args) => { hints = args[4]!.concepts; return originalSeeds(...args); };
  const result = await runAsk({ ...request, question: original }, deps);
  assert.equal(result.status, 'answered');
  assert.deepEqual(deps.queries, [corrected]); assert.deepEqual(hints, ['boiling', 'temperature', 'heating']);
  assert.equal(deps.stages.filter((s) => s === 'understanding').length, 1);
  if (result.status === 'answered') assert.equal(result.interpretation?.originalQuestion, original);
  assert.ok(preservationFailures(original, 'Why does temperature increase during boiling even when we keep heating?').length);
  assert.ok(Number.isFinite(deps.trace.durations.evidence_selection));
});

test('concept hints augment the full question; synonyms do not become mandatory lexical matches', () => {
  const terms = searchTerms('Why does electrical resistance change when temperature increases?', ['opposition to current']);
  assert.ok(terms.includes('resistance')); assert.ok(terms.includes('opposition')); assert.ok(terms.includes('increases'));
  assert.deepEqual(searchTerms('why what the', []), []);
  assert.ok(searchTerms('x '.repeat(400), ['temperature']).length <= 48);
});

test('hybrid order retains a lexical candidate but gate sorts genuine cosine scores, never fusion scores', () => {
  const lexical = { ...seed, id: 'lexical', selectionRank: 2, score: 0.1, content: 'Temperature condition qualification with an unrelated low vector score.' };
  const vector = { ...seed, selectionRank: 1 };
  const selected = independentSeeds([lexical, vector], scope);
  assert.deepEqual(selected.map((s) => s.id), [seed.id, 'lexical']);
  assert.equal(evaluateConfidence(scoredEvidence([lexical])).decision, 'REFUSE');
  assert.equal(scoredEvidence([lexical, vector])[0].score, seed.score);
});

test('relationship expansion retains a useful condition and rejects an isolated keyword list', () => {
  const list = { ...neighbor, id: 'keyword-list', content: 'Temperature: chapter headings, index, glossary and apparatus list.' };
  const disjoint = { ...neighbor, id: 'disjoint', content: 'Temperature is listed in the index. Rain causes wet ground.' };
  const condition = { ...neighbor, content: 'This relationship holds only if temperature remains constant; otherwise resistance changes.' };
  const result = assembleEvidence([seed], [list, disjoint, condition], scope, ['temperature'], readAskConfig({}), 'Why must temperature stay constant?');
  assert.deepEqual(result.evidence.map((c) => c.id), [seed.id, neighbor.id]);
});

test('exact source is validated by contract and cannot enter another source or chapter evidence', () => {
  assert.equal(askRequestSchema.safeParse({ ...request, sourceId: 'not-a-uuid' }).success, false);
  const exact = { ...scope, sourceId: seed.sourceId };
  assert.throws(() => independentSeeds([{ ...seed, sourceId: 'other-book' }], exact));
  assert.throws(() => independentSeeds([{ ...seed, chapterNo: 15 }], exact));
  assert.deepEqual(assembleEvidence([seed], [{ ...neighbor, sourceId: 'other-book' }], exact, ['Ohm'], readAskConfig({})).evidence.map((c) => c.id), [seed.id]);
});

test('neighbor queries merge repeated overlapping windows but never bridge unrelated ranges or sources', () => {
  const ranges = neighborRanges([seed, { ...seed, id: 'next', chunkIndex: 3 }, { ...seed, id: 'far', chunkIndex: 20 }, { ...seed, id: 'foreign', sectionId: 'other-section', sourceId: 'other-source' }], 1);
  assert.equal(ranges.length, 3);
  assert.ok(ranges.some((r) => r.low === 1 && r.high === 4));
  assert.ok(ranges.some((r) => r.low === 19 && r.high === 21));
  assert.deepEqual(neighborRanges([seed], 0), []);
});

test('selected source survives normal Ask scope, citations and signed clarification without permitting a source switch', async () => {
  const exact = { ...scope, sourceId: '00000000-0000-4000-8000-000000000001' };
  const deps = fixtureDependencies({ seeds: [{ ...seed, sourceId: exact.sourceId }], neighbors: [{ ...neighbor, sourceId: exact.sourceId }] });
  const result = await runAsk({ ...request, sourceId: exact.sourceId }, deps);
  assert.equal(result.status, 'answered');
  if (result.status === 'answered') {
    assert.equal(result.boundary?.scope.sourceId, exact.sourceId);
    assert.deepEqual(result.boundary?.sourceIds, [exact.sourceId]);
    assert.equal(result.citations[0].pageFrom, seed.pageFrom);
  }
  const args = { originalQuestion: request.question, scope: exact, language: 'en' as const, owner: 'fixture', attempt: 1, understanding: ambiguous };
  const token = issueClarification(args, 600);
  assert.throws(() => resumeClarification(token, request.question, { ...exact, sourceId: '00000000-0000-4000-8000-000000000002' }, 'en', 'fixture'));
});
