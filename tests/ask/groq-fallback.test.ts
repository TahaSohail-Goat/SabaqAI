import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createAskProvider } from '../../src/lib/ask/provider';
import { readAskConfig, AskFailure } from '../../src/lib/ask/config';
import { getGeminiClient } from '../../src/lib/gemini';
import { AskTransientProviderFailure } from '../../src/lib/ask/transport';
import { runAsk } from '../../src/lib/ask/orchestrator';
import { fixtureDependencies, request } from './fixtures';

const schema = z.object({ ok: z.boolean() }).strict();
const config = readAskConfig({});
const success = (content = '{"ok":true}', tokens = 40, finish = 'stop') => Response.json({
  choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: tokens },
});
const groq = (fetcher: typeof fetch, overrides = config) => createAskProvider(overrides, new AbortController().signal,
  { gemini: null, env: { GROQ_API_KEY: 'test-only-placeholder' }, fetch: fetcher });

test('Groq reuses the configured text model, strict schema and abort signal', async () => {
  const provider = groq(async (url, init) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'openai/gpt-oss-120b');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.messages[0].content, 'instruction');
    assert.deepEqual(JSON.parse(body.messages[1].content), { evidence: 'stored row' });
    assert.equal(body.max_completion_tokens, config.outputTokens);
    assert.ok(init?.signal);
    return success();
  });
  assert.deepEqual(await provider.json('review', 'instruction', { evidence: 'stored row' }, schema), { ok: true });
  assert.equal(provider.calls, 1);
  assert.equal(provider.providerName, 'groq');
  assert.equal(provider.tokenCountMode, 'estimate_with_usage_check');
});

test('Groq planning has no tokenizer API call and actual usage rejects over-budget output', async () => {
  let calls = 0;
  const provider = groq(async () => { calls++; return success('{"ok":true}', config.tokens + 1); });
  assert.ok(await provider.countTokens('instruction', { question: 'سوال' }) > 0);
  assert.equal(calls, 0);
  await assert.rejects(provider.json('explanation', '', {}, schema), (e: unknown) => e instanceof AskFailure && e.code === 'invalid_output');
});

test('missing usage, malformed JSON, invalid fields and truncated completions fail closed', async () => {
  for (const response of [Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }), success('not json'),
    success('{"ok":true,"invented":1}'), success('{"ok":true}', 20, 'length')]) {
    await assert.rejects(groq(async () => response).json('review', '', {}, schema), AskFailure);
  }
});

test('Groq failure, expired deadline and call cap never synthesize an answer', async () => {
  await assert.rejects(groq(async () => new Response('', { status: 401 })).json('explanation', '', {}, schema), AskFailure);
  const provider = groq(async () => success(), { ...config, calls: 2 });
  await provider.json('understanding', '', {}, schema); await provider.json('explanation', '', {}, schema);
  await assert.rejects(provider.json('review', '', {}, schema), AskFailure);
  assert.equal(provider.calls, 2);
  const controller = new AbortController(); controller.abort(); let called = false;
  const expired = createAskProvider(config, controller.signal, { gemini: null, env: { GROQ_API_KEY: 'test' }, fetch: async () => { called = true; return success(); } });
  await assert.rejects(expired.json('explanation', '', {}, schema), AskFailure);
  assert.equal(called, false);
});

test('Gemini transient failure switches the next counted attempt to Groq; auth/schema do not', async () => {
  const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'test-only-placeholder';
  const ai = getGeminiClient()!;
  try {
    for (const status of [503, 429, 400, 401]) {
      const mocked = mock.method(ai.models, 'generateContent', async () => { throw Object.assign(new Error('provider failure'), { status }); });
      let groqCalls = 0;
      const provider = createAskProvider(config, new AbortController().signal, { gemini: ai, env: { GROQ_API_KEY: 'test' }, fetch: async () => { groqCalls++; return success(); } });
      await assert.rejects(provider.json('understanding', '', {}, schema), status === 503 || status === 429 ? AskTransientProviderFailure : AskFailure);
      if (status === 503 || status === 429) {
        assert.deepEqual(await provider.json('understanding', '', {}, schema), { ok: true });
        assert.equal(provider.calls, 2); assert.equal(groqCalls, 1);
      } else { assert.equal(provider.providerName, 'gemini'); assert.equal(groqCalls, 0); }
      mocked.mock.restore();
    }
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; mock.restoreAll(); }
});

test('the actual Groq adapter passes through the complete grounding/adequacy pipeline', async () => {
  const deps = fixtureDependencies(); const fixture = deps.provider;
  deps.provider = groq(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const stage = body.response_format.json_schema.name.replace('ask_', '');
    const answer = await fixture.json(stage, body.messages[0].content, JSON.parse(body.messages[1].content), schema);
    return success(JSON.stringify(answer));
  });
  assert.equal((await runAsk(request, deps)).status, 'answered');
  assert.equal(deps.stages.at(-1), 'review');
  assert.equal(deps.trace.provider, 'groq');
});

test('empty scoped retrieval refuses without Groq teaching or review', async () => {
  const deps = fixtureDependencies(); deps.config.understanding = false;
  deps.retrieval.seeds = async () => [];
  let calls = 0; deps.provider = groq(async () => { calls++; return success(); });
  assert.equal((await runAsk(request, deps)).status, 'refused'); assert.equal(calls, 0);
});

test('a simulated Gemini outage switches within the orchestrator budget and still reviews the answer', async () => {
  const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'test-only-placeholder';
  const ai = getGeminiClient()!, deps = fixtureDependencies(), fixture = deps.provider;
  const failure = mock.method(ai.models, 'generateContent', async () => { throw Object.assign(new Error('outage'), { status: 503 }); });
  try {
    deps.provider = createAskProvider(deps.config, deps.signal, { gemini: ai, env: { GROQ_API_KEY: 'test' }, fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return success(JSON.stringify(await fixture.json(body.response_format.json_schema.name.replace('ask_', ''), body.messages[0].content, JSON.parse(body.messages[1].content), schema)));
    } });
    assert.equal((await runAsk(request, deps)).status, 'answered');
    assert.equal(deps.provider.calls, 4); assert.equal(deps.trace.transportRetries, 1);
    assert.equal(deps.trace.providerRetryCode, 'HTTP_503'); assert.equal(deps.stages.at(-1), 'review');
  } finally { failure.mock.restore(); if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

test('Groq cannot bypass an unsupported grounding verdict', async () => {
  const deps = fixtureDependencies({ review: { coherent: true, coreSupported: false, verdicts: [
    { statementId: 's1', verdict: 'unsupported', chunkIds: ['fixture-ohm-core'], reason: 'Unsupported test claim.' },
    { statementId: 's2', verdict: 'supported', chunkIds: ['fixture-ohm-core'], reason: 'Supported test illustration.' },
  ] } }), fixture = deps.provider;
  deps.provider = groq(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return success(JSON.stringify(await fixture.json(body.response_format.json_schema.name.replace('ask_', ''), body.messages[0].content, JSON.parse(body.messages[1].content), schema)));
  });
  assert.equal((await runAsk(request, deps)).status, 'refused'); assert.equal(deps.stages.at(-1), 'review');
});
