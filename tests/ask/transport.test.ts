import test from 'node:test';
import assert from 'node:assert/strict';
import { AskTransportFailure, AskTransientProviderFailure, providerRetryCode, transportFailureCode } from '../../src/lib/ask/transport';
import { AskFailure } from '../../src/lib/ask/config';
import { runAsk } from '../../src/lib/ask/orchestrator';
import { fixtureDependencies, request } from './fixtures';

test('transport diagnostics recognize nested connection failures without exposing raw errors', () => {
  const failure = new TypeError('fetch failed: secret request text', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
  assert.equal(transportFailureCode(failure), 'UND_ERR_CONNECT_TIMEOUT');
  assert.equal(transportFailureCode(new TypeError('fetch failed')), 'fetch_failed');
  assert.equal(transportFailureCode(new Error('A private SDK message')), null);
});

test('quota, auth, schema, service HTTP responses and aborted requests are never transport retries', () => {
  for (const status of [400, 401, 403, 429, 500, 503]) {
    assert.equal(transportFailureCode(Object.assign(new Error('fetch failed'), { status, cause: { code: 'ECONNRESET' } })), null);
  }
  for (const name of ['AbortError', 'TimeoutError']) assert.equal(transportFailureCode(Object.assign(new Error('fetch failed'), { name })), null);
});

test('one failed connection can recover without skipping grounding or adequacy review', async () => {
  const deps = fixtureDependencies(), original = deps.provider.json;
  let attempts = 0;
  deps.provider.json = async (...args) => {
    if (++attempts === 1) throw new AskTransportFailure('UND_ERR_CONNECT_TIMEOUT');
    return original(...args);
  };
  assert.equal((await runAsk(request, deps)).status, 'answered');
  assert.equal(attempts, 4); // failed understanding + understanding + teaching + review
  assert.equal(deps.trace.transportRetries, 1);
  assert.equal(deps.stages.at(-1), 'review');
});

test('a second connection failure stops after one retry without retrieval or fabricated output', async () => {
  const deps = fixtureDependencies(); let attempts = 0;
  deps.provider.json = async () => { attempts++; throw new AskTransportFailure('ECONNRESET'); };
  await assert.rejects(runAsk(request, deps));
  assert.equal(attempts, 2);
  assert.equal(deps.queries.length, 0);
});

test('the one transport retry is shared by all stages, not repeated for each stage', async () => {
  const deps = fixtureDependencies(), original = deps.provider.json;
  let attempts = 0;
  deps.provider.json = async (...args) => {
    attempts++;
    if (attempts === 1 || args[0] === 'explanation') throw new AskTransportFailure('ECONNRESET');
    return original(...args);
  };
  await assert.rejects(runAsk(request, deps));
  assert.equal(attempts, 3);
  assert.equal(deps.trace.transportRetries, 1);
});

test('explicit model-call cap counts failed transport attempts and cannot be exceeded', async () => {
  const deps = fixtureDependencies(), original = deps.provider.json;
  deps.config.calls = 2; let attempts = 0;
  deps.provider.json = async (...args) => { if (++attempts === 1) throw new AskTransportFailure('ECONNRESET'); return original(...args); };
  await assert.rejects(runAsk(request, deps));
  assert.equal(attempts, 2);
  assert.equal(deps.stages.includes('explanation'), false);
});

test('ordinary provider unavailability does not trigger blind retry', async () => {
  const deps = fixtureDependencies(); let attempts = 0;
  deps.provider.json = async () => { attempts++; throw new AskFailure('unavailable', 503, true); };
  await assert.rejects(runAsk(request, deps));
  assert.equal(attempts, 1);
});

test('confirmed temporary HTTP gateway/service failures can retry, but quota/auth/schema failures cannot', async () => {
  for (const status of [502, 503, 504]) assert.equal(providerRetryCode(Object.assign(new Error('Service unavailable'), { status })), `HTTP_${status}`);
  for (const status of [400, 401, 403, 429]) assert.equal(providerRetryCode(Object.assign(new Error('Invalid request'), { status })), null);
  assert.equal(providerRetryCode(Object.assign(new Error('RESOURCE_EXHAUSTED quota'), { status: 503 })), null);
  assert.equal(providerRetryCode({ message: 'quota exhausted', status: 503 }), null);
  const deps = fixtureDependencies(), original = deps.provider.json; let attempts = 0;
  deps.provider.json = async (...args) => { if (++attempts === 1) throw new AskTransientProviderFailure('HTTP_503'); return original(...args); };
  assert.equal((await runAsk(request, deps)).status, 'answered');
  assert.equal(attempts, 4);
  assert.equal(deps.trace.providerRetryCode, 'HTTP_503');
});

test('deadline expiration prevents a retry', async () => {
  const deps = fixtureDependencies(), controller = new AbortController();
  deps.signal = controller.signal; let attempts = 0;
  deps.provider.json = async () => { attempts++; controller.abort(); throw new AskTransportFailure('ECONNRESET'); };
  await assert.rejects(runAsk(request, deps), (error: unknown) => error instanceof AskFailure && error.code === 'timeout');
  assert.equal(attempts, 1);
});

test('token-count connection retry uses the same one-retry allowance without adding model calls', async () => {
  const deps = fixtureDependencies(); let counts = 0;
  deps.provider.countTokens = async () => { if (++counts === 1) throw new AskTransportFailure('ECONNRESET'); return 800; };
  assert.equal((await runAsk(request, deps)).status, 'answered');
  assert.equal(counts, 2);
  assert.equal(deps.stages.length, 3);
  assert.equal(deps.trace.transportRetries, 1);
});
