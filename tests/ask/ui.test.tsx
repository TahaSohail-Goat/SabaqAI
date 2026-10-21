import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import AskResultView from '../../src/components/app/AskResultView';
import { runAsk } from '../../src/lib/ask/orchestrator';
import type { AskResponse } from '../../src/lib/types';
import { ambiguous, request, fixtureDependencies } from './fixtures';

function render(result: AskResponse) {
  return renderToStaticMarkup(<AskResultView result={result} selectedCitation={null} onCitation={() => {}} onClarify={() => {}} onEdit={() => {}} onRetry={() => {}} />);
}
test('answered UI shows explanation before secondary sources, labeled illustration and source controls', async () => {
  const result = await runAsk(request, fixtureDependencies());
  const html = render(result);
  assert.ok(html.indexOf('V = IR') < html.indexOf('Sources ('));
  assert.match(html, /Illustration:/); assert.match(html, /p\. 12/);
  assert.match(html, /<details/); assert.doesNotMatch(html, /verified|100%/i);
});
test('clarification renders semantic buttons and a free-text form without refusal or citations', async () => {
  const html = render(await runAsk(request, fixtureDependencies({ understanding: ambiguous })));
  assert.match(html, /Heating effect/); assert.match(html, /Magnetic effect/);
  assert.match(html, /<textarea/); assert.match(html, /<button type="button"/);
  assert.doesNotMatch(html, /Sources \(|Question refused|High retrieval/);
});
test('operational error has a truthful retry action and no success content', () => {
  const html = render({ status: 'error', code: 'unavailable', requestId: 'TEST', message: 'Please try again.', retryable: true });
  assert.match(html, /Try again/); assert.doesNotMatch(html, /Grounded|Sources/);
});
test('Urdu blocks set direction and formula references remain isolated', async () => {
  const result = await runAsk(request, fixtureDependencies());
  if (result.status !== 'answered') assert.fail();
  const html = render({ ...result, language: 'ur' });
  assert.match(html, /dir="rtl"/); assert.match(html, /<bdi dir="ltr">/);
});
test('untrusted student/model strings are escaped as text', async () => {
  const result = await runAsk(request, fixtureDependencies());
  if (result.status !== 'answered') assert.fail();
  result.statements[0].text = '<img src=x onerror=alert(1)>';
  const html = render(result);
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/);
});
test('legacy persisted answered response remains renderable without blocks', () => {
  const html = render({ status: 'answered', confidence: { band: 'medium', top1: 0.48, support: 0 }, language: 'en',
    statements: [{ text: 'TEST legacy statement.', chunkIds: ['fixture-legacy'] }],
    citations: [{ chunkId: 'fixture-legacy', chapterNo: 1, chapterTitle: null, section: null, pageFrom: null, pageTo: null, sourceType: 'textbook', excerpt: 'TEST legacy excerpt.' }], notCovered: null });
  assert.match(html, /TEST legacy statement/); assert.match(html, /Page unknown/);
});
