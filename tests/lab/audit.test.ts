import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProposal, explanationBlocks } from '../../src/lib/lab/guidance';
import { solve, suggestedInput } from '../../src/lib/lab/engine';

test('supported natural units, leading decimals and scientific notation preserve quantities', () => {
  for (const question of ['Move at 4 meters per second for .5 seconds', 'Move at 4 metres per second for 5e-1 s']) {
    const action = { action: 'propose', experimentId: 'uniform', clarification: null,
      parameters: [{ key: 'u', quantity: { value: 4, unit: 'm/s' } }, { key: 'duration', quantity: { value: 0.5, unit: 's' } }] };
    assert.equal(validateProposal(action, question).status, 'proposal');
  }
});
test('from rest authorizes zero initial velocity but never zero second-leg velocity or an invented nonzero value', () => {
  const action = { action: 'propose', experimentId: 'acceleration', clarification: null,
    parameters: [{ key: 'u', quantity: { value: 0, unit: 'm/s' } }, { key: 'a', quantity: { value: 2, unit: 'm/s²' } }, { key: 'duration', quantity: { value: 5, unit: 's' } }] };
  assert.equal(validateProposal(action, 'A cart starts from rest at a constant acceleration of 2 meters per second squared for 5 seconds').status, 'proposal');
  assert.throws(() => validateProposal({ ...action, parameters: action.parameters.slice(1) }, 'A cart starts from rest at 2 m/s² for 5 s'));
  for (const question of ['The cart starts at rest', 'The cart is initially stationary']) assert.equal(validateProposal({ ...action, parameters: [action.parameters[0]] }, question).status, 'proposal');
  assert.throws(() => validateProposal({ ...action, parameters: [action.parameters[0]] }, 'The cart comes to rest'));
  assert.throws(() => validateProposal({ ...action, parameters: [{ key: 'u', quantity: { value: 3, unit: 'm/s' } }] }, 'A cart starts from rest'));
  assert.throws(() => validateProposal({ action: 'propose', experimentId: 'journey', clarification: null, parameters: [{ key: 'v2', quantity: { value: 0, unit: 'm/s' } }] }, 'A cart starts from rest'));
});
test('normalization still rejects changed quantities and numbers hidden inside malformed notation', () => {
  const action = { action: 'propose', experimentId: 'uniform', clarification: null, parameters: [{ key: 'duration', quantity: { value: 5, unit: 's' } }] };
  assert.throws(() => validateProposal(action, 'Run for .5 seconds'));
  assert.throws(() => validateProposal(action, 'Run for 1e5 seconds'));
  assert.throws(() => validateProposal(action, 'Run for 1,5 seconds'));
});
test('journey teaching distinguishes signed displacement from its magnitude and does not invent a return leg', () => {
  const left = suggestedInput('journey'); left.parameters.u.value = -4; left.parameters.v2!.value = 2;
  const result = solve(left), text = explanationBlocks(result).journey;
  assert.equal(result.displacement, -10); assert.equal(result.distance, 30);
  assert.doesNotMatch(text, /reduces displacement/);
  assert.match(text, /magnitude|distance from the start/);
  const forward = suggestedInput('journey'); forward.parameters.v2!.value = 2;
  assert.doesNotMatch(explanationBlocks(solve(forward)).journey, /return|Returning/);
});
