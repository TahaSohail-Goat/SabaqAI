import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedLabProvider } from '../../src/lib/lab/provider';
import type { AskProvider } from '../../src/lib/ask/provider';
import { AskTransientProviderFailure } from '../../src/lib/ask/transport';
import { proposalSchema } from '../../src/lib/lab/contracts';

const good = { action: 'propose', experimentId: 'uniform', parameters: [], clarification: null };
function provider() {
  let calls = 0, name: 'gemini' | 'groq' = 'gemini';
  const fake: AskProvider = { get calls() { return calls; }, get providerName() { return name; }, countTokens: async () => 100,
    json: async () => { calls++; if (calls === 1) { name = 'groq'; throw new AskTransientProviderFailure('HTTP_429'); } return good; } };
  return { fake, calls: () => calls };
}
test('Lab transport permits exactly one Gemini-to-Groq fallback on recognized provider failure', async () => {
  const p = provider(); const result = await boundedLabProvider(p.fake, new AbortController().signal).json('test', {}, proposalSchema);
  assert.deepEqual(result, good); assert.equal(p.calls(), 2);
});
test('Lab rejects malformed output without a fallback and does not repeat same-provider failures', async () => {
  for (const output of [() => ({ ...good, extra: 'fabricated' }), () => { throw new AskTransientProviderFailure('HTTP_429'); }]) {
    let calls = 0;
    const fake: AskProvider = { calls: 0, providerName: 'gemini', countTokens: async () => 100, json: async () => { calls++; return output(); } };
    await assert.rejects(boundedLabProvider(fake, new AbortController().signal).json('test', {}, proposalSchema)); assert.equal(calls, 1);
  }
});
test('fallback failure stops at two attempts; cancellation and oversized payloads spend no fallback', async () => {
  const p = provider(), first = p.fake.json; let attempts = 0;
  p.fake.json = async (...args) => { attempts++; if (attempts > 1) throw new Error('provider down'); return first(...args); };
  await assert.rejects(boundedLabProvider(p.fake, new AbortController().signal).json('test', {}, proposalSchema));
  assert.equal(attempts, 2);
  const f = provider(); await assert.rejects(boundedLabProvider(f.fake, new AbortController().signal).json('test', 'a'.repeat(20001), proposalSchema)); assert.equal(f.calls(), 0);
  const c = provider(), signal = new AbortController(); signal.abort();
  await assert.rejects(boundedLabProvider(c.fake, signal.signal).json('test', {}, proposalSchema)); assert.equal(c.calls(), 0);
});
