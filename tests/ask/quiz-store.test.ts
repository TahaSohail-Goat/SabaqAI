import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { quizReviewStore } from '../../src/lib/quiz/explain-store';

test('real Quiz store sends owner, attempt, question and lease-token filters to PostgREST', async () => {
  const calls: { method: string; url: URL; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    const pieces: Buffer[] = []; for await (const piece of req) pieces.push(Buffer.from(piece));
    const text = Buffer.concat(pieces).toString();
    const url = new URL(req.url!, 'http://fixture');
    calls.push({ method: req.method!, url, body: text ? JSON.parse(text) : {} });
    res.setHeader('Content-Type', 'application/json');
    res.end(url.pathname.includes('claim_') ? '0' : url.pathname.includes('finish_') ? 'null' : '[]');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const db = createClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'invented-fixture-key');
    const store = quizReviewStore(db), signal = new AbortController().signal;
    await store.attempt('attempt', 'student', signal);
    await store.answer('attempt', 'question', signal);
    assert.equal(await store.claim('hash', 'student', 'token', signal), 0);
    await store.finish('hash', 'token', true);
    assert.equal(calls[0].url.searchParams.get('user_id'), 'eq.student');
    assert.equal(calls[0].url.searchParams.get('quizzes.user_id'), 'eq.student');
    assert.equal(calls[0].url.searchParams.get('id'), 'eq.attempt');
    assert.equal(calls[1].url.searchParams.get('attempt_id'), 'eq.attempt');
    assert.equal(calls[1].url.searchParams.get('question_id'), 'eq.question');
    assert.deepEqual(calls[2].body, { p_key: 'hash', p_user: 'student', p_token: 'token' });
    assert.deepEqual(calls[3].body, { p_key: 'hash', p_token: 'token', p_success: true });
    assert.deepEqual(calls.map((c) => c.method), ['GET', 'GET', 'POST', 'POST']);
    assert(!calls.some((c) => c.url.pathname.includes('answer_keys') || c.url.pathname.includes('rubrics')));
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
