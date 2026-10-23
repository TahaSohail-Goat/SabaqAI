import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { runAskService } from '../../src/lib/ask/service';
import { AskFailure } from '../../src/lib/ask/config';
import { createAskProvider } from '../../src/lib/ask/provider';
import { getGeminiClient } from '../../src/lib/gemini';
import { askResponseSchema } from '../../src/lib/ask/contracts';
import { fixtureDependencies, request, seed, answer } from './fixtures';

const sourceId = '81855080-15fb-4971-b9da-5f1ddb616f74';
const input = { ...request, sourceId };
const authorization = { userId: null, profile: null };
function failed(stage = 'understanding') {
  const deps = fixtureDependencies({ seeds: [{ ...seed, sourceId }], neighbors: [] });
  const original = deps.provider.json;
  deps.provider = { ...deps.provider, bothProvidersFailed: true,
    json: async (...args) => { if (args[0] === stage) throw new AskFailure('unavailable', 503, true); return original(...args); } };
  return deps;
}
const run = (deps: ReturnType<typeof failed>, value: typeof request & { sourceId?: string } = input) => runAskService({ mode: 'student_question', request: value }, authorization, deps);

test('both providers unavailable before understanding retrieves the unchanged original question once', async () => {
  const deps = failed(); const result = await run(deps);
  assert.equal(result.status, 'sources_only'); if (result.status !== 'sources_only') assert.fail();
  assert.equal(result.originalQuestion, input.question); assert.equal(result.scope.sourceId, sourceId);
  assert.deepEqual(deps.queries, [input.question]); assert.deepEqual(deps.stages, []);
  assert.equal(result.citations[0].chunkId, seed.id); assert.equal(result.citations[0].pageFrom, seed.pageFrom);
  assert.equal(result.citations[0].excerpt, seed.content.slice(0, 400));
  assert.match(result.message, /No explanation was generated/);
  assert.match(result.message, /have not been assessed/);
  assert.ok(askResponseSchema.safeParse(result).success); assert.equal(deps.trace.sourcesOnly, true);
  assert.ok(!('statements' in result)); assert.ok(!('confidence' in result)); assert.ok(!('supportReview' in result));
});

test('failure after retrieval reuses scoped rows and drops the unreviewed model draft', async () => {
  const deps = failed('review'); const result = await run(deps);
  assert.equal(result.status, 'sources_only'); assert.equal(deps.queries.length, 1);
  assert.deepEqual(deps.stages, ['understanding', 'explanation']);
  assert.ok(!('statements' in result)); assert.ok(!JSON.stringify(result).includes(answer().statements[1].text));
});

test('a failed first provider alone does not trigger sources only', async () => {
  const deps = failed(); deps.provider = { ...deps.provider, bothProvidersFailed: false };
  await assert.rejects(run(deps), AskFailure); assert.equal(deps.queries.length, 0);
});

test('source-only browsing rejects foreign source, chapter, class, subject and board rows', async () => {
  for (const changed of [{ sourceId: 'different-source' }, { chapterNo: 3 }, { classLevel: 9 }, { subject: 'chemistry' }, { board: 'other-board' }]) {
    const deps = failed(); deps.retrieval.seeds = async () => [{ ...seed, sourceId, ...changed }];
    await assert.rejects(run(deps), AskFailure); assert.notEqual(deps.trace.sourcesOnly, true);
  }
});

test('missing passages, missing source identity and failed retrieval do not invent citations', async () => {
  const empty = failed(); empty.retrieval.seeds = async () => [];
  await assert.rejects(run(empty), AskFailure);
  const unavailable = failed(); unavailable.retrieval.seeds = async () => { throw new Error('database failure'); };
  await assert.rejects(run(unavailable), AskFailure);
  const noSource = failed(); await assert.rejects(run(noSource, { ...input, sourceId: undefined }), AskFailure);
  assert.equal(noSource.queries.length, 0);
});

test('invalid output and expired deadline remain errors rather than source-only success', async () => {
  const invalid = failed(); invalid.provider.json = async () => { throw new AskFailure('invalid_output', 502, true); };
  await assert.rejects(run(invalid), AskFailure); assert.equal(invalid.queries.length, 0);
  const expired = failed(), controller = new AbortController(); controller.abort(); expired.signal = controller.signal;
  await assert.rejects(run(expired), AskFailure); assert.equal(expired.queries.length, 0);
});

test('a final retrieval refusal remains terminal even if both providers previously failed', async () => {
  const deps = failed('unused'); deps.retrieval.seeds = async () => [];
  assert.equal((await run(deps)).status, 'refused'); assert.deepEqual(deps.stages, ['understanding']);
  assert.notEqual(deps.trace.sourcesOnly, true);
});

test('sources-only schema rejects answer claims and fabricated success labels', async () => {
  const result = await run(failed());
  for (const fields of [{ statements: answer().statements }, { confidence: { band: 'high' } }, { supportReview: 'model_reviewed' }])
    assert.equal(askResponseSchema.safeParse({ ...result, ...fields }).success, false);
});

test('actual Gemini and Groq HTTP failures produce sources only without a third model call', async () => {
  const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'test-only-placeholder';
  const ai = getGeminiClient()!, deps = failed(); let groqCalls = 0;
  const primary = mock.method(ai.models, 'generateContent', async () => { throw Object.assign(new Error('outage'), { status: 503 }); });
  try {
    deps.provider = createAskProvider(deps.config, deps.signal, { gemini: ai, env: { GROQ_API_KEY: 'test-placeholder' },
      fetch: async () => { groqCalls++; return new Response('', { status: 503 }); } });
    assert.equal((await run(deps)).status, 'sources_only');
    assert.equal(deps.provider.calls, 2); assert.equal(groqCalls, 1); assert.equal(deps.queries.length, 1);
    assert.equal(deps.provider.bothProvidersFailed, true);
  } finally { primary.mock.restore(); if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});
