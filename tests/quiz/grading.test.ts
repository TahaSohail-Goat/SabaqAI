import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWrittenReview, parseCriteria } from '../../src/lib/quiz/grading';
import { summarizeAttempt } from '../../src/lib/quiz/feedback';

const content = 'A force can change the state of motion of a body. The force of friction opposes motion between surfaces.';
const source = {
  chunkId: 'stored-chunk', chapterNo: 3, chapterTitle: 'Dynamics', section: 'Forces',
  pageFrom: 18, pageTo: 19, content,
};

test('rejects marking points without exact stored textbook evidence', () => {
  assert.equal(parseCriteria([{ expectation: 'Gravity', sourceQuote: 'Gravity is a force between two masses.' }], 1, content), null);
  assert.equal(parseCriteria([], 1, content), null);
});

test('sums deductions from verified one-mark criteria and reconstructs stored citation', () => {
  const criteria = parseCriteria([
    { expectation: 'Effect of force', sourceQuote: 'A force can change the state of motion of a body.' },
    { expectation: 'Friction direction', sourceQuote: 'The force of friction opposes motion between surfaces.' },
  ], 2, content);
  assert.ok(criteria);
  const review = buildWrittenReview([
    { criterionId: 'c1', awarded: 1, reason: 'Correct effect stated.' },
    { criterionId: 'c2', awarded: 0.5, reason: 'Direction mentioned but surfaces omitted.' },
  ], criteria, source);
  assert.ok(review);
  assert.equal(review.totalAwarded, 1.5);
  assert.equal(review.totalDeducted, 0.5);
  assert.equal(review.criteria[1].source.pageFrom, 18);
  assert.equal(review.criteria[1].source.excerpt, 'The force of friction opposes motion between surfaces.');
});

test('refuses malformed, duplicate, or invented criterion grades', () => {
  const criteria = parseCriteria([{ expectation: 'Effect', sourceQuote: 'A force can change the state of motion of a body.' }], 1, content);
  assert.ok(criteria);
  assert.equal(buildWrittenReview([{ criterionId: 'c1', awarded: 1.2, reason: 'Good.' }], criteria, source), null);
  assert.equal(buildWrittenReview([{ criterionId: 'c2', awarded: 1, reason: 'Good.' }], criteria, source), null);
  assert.equal(buildWrittenReview([], criteria, source), null);
});

test('does not count unavailable written marks as zero in the results summary', () => {
  const summary = summarizeAttempt([
    { questionType: 'mcq', section: null, page: null, correct: true, pointsAwarded: 1, pointsPossible: 1, answered: true },
    { questionType: 'short', section: null, page: null, correct: false, gradingState: 'unavailable', pointsAwarded: 0, pointsPossible: 2, answered: true },
  ]);
  assert.equal(summary.ungradedCount, 1);
  assert.equal(summary.pointsPossible, 1);
  assert.equal(summary.scorePct, 100);
  assert.match(summary.recommendation, /partial result/i);
});
