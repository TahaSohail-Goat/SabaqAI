import test from 'node:test';
import assert from 'node:assert/strict';
import { comparison, motionAt, normalizeInput, settingsAsInput, solve, suggestedInput, toSI } from '../../src/lib/lab/engine';
import { EXPERIMENTS } from '../../src/lib/lab/registry';
import type { LabExperimentId, LabParameterKey } from '../../src/lib/types';

function input(id: LabExperimentId, values: Partial<Record<LabParameterKey, number>> = {}) {
  const result = suggestedInput(id);
  for (const [key, value] of Object.entries(values)) result.parameters[key as LabParameterKey]!.value = value;
  return result;
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('uniform independent example: 4 m/s × 5 s, starting at 7 m', () => {
  const r = solve(input('uniform', { x0: 7 }));
  assert.equal(r.distance, 20); assert.equal(r.displacement, 20); assert.equal(r.finalPosition, 27);
  assert.equal(r.finalVelocity, 4); assert.equal(r.averageSpeed, 4);
});
test('negative uniform velocity changes signed position, never signed distance', () => {
  const r = solve(input('uniform', { u: -3, duration: 4 }));
  assert.equal(r.distance, 12); assert.equal(r.displacement, -12); assert.equal(r.averageVelocity, -3);
});
test('stationary cases and acceleration-zero degeneration', () => {
  for (const id of ['uniform', 'acceleration'] as const) {
    const r = solve(input(id, id === 'acceleration' ? { x0: -4, u: 0, a: 0 } : { x0: -4, u: 0 }));
    assert.equal(r.distance, 0); assert.equal(r.finalPosition, -4); assert.equal(r.turningTime, null);
  }
  assert.equal(solve(input('acceleration', { a: 0, u: -4 })).distance, 20);
});
test('constant acceleration independent example: u=2, a=2, t=5', () => {
  const r = solve(input('acceleration', { x0: 7 }));
  assert.equal(r.finalVelocity, 12); assert.equal(r.displacement, 35); assert.equal(r.finalPosition, 42);
  assert.equal(r.distance, 35); assert.equal(r.averageVelocity, 7);
});
test('turn at 3 s: 9 m outward and 9 m back, not zero distance', () => {
  const r = solve(input('acceleration', { u: 6, a: -2, duration: 6 }));
  assert.equal(r.turningTime, 3); assert.equal(r.distance, 18); assert.equal(r.displacement, 0); assert.equal(r.finalVelocity, -6);
  assert.equal(motionAt(r.settings, 3).position, 9); assert.equal(motionAt(r.settings, 3).velocity, 0);
  assert.ok(r.samples.some((sample) => sample.t === 3));
});
test('negative velocity and negative acceleration increase speed; turn at endpoint is not reversal', () => {
  const r = solve(input('acceleration', { u: -2, a: -1, duration: 4 }));
  assert.equal(r.distance, 16); assert.equal(r.displacement, -16); assert.equal(r.finalVelocity, -6);
  const stop = solve(input('acceleration', { u: 6, a: -2, duration: 3 }));
  assert.equal(stop.distance, 9); assert.equal(stop.turningTime, null);
});
test('two-leg round trip has positive distance and zero displacement', () => {
  const r = solve(input('journey'));
  assert.equal(r.distance, 40); assert.equal(r.displacement, 0); assert.equal(r.duration, 10);
  assert.equal(r.averageSpeed, 4); assert.equal(r.averageVelocity, 0); assert.equal(r.samples[0].acceleration, null);
  assert.equal(motionAt(r.settings, 5).position, 20); assert.equal(motionAt(r.settings, 10).position, 0);
});
test('two-leg unequal times use the entire journey for both averages', () => {
  const r = solve(input('journey', { v2: -2, duration2: 10 }));
  assert.equal(r.distance, 40); assert.equal(r.displacement, 0); assert.equal(r.duration, 15); close(r.averageSpeed, 40 / 15);
  const noTurn = solve(input('journey', { v2: 2, duration2: 3 }));
  assert.equal(noTurn.distance, 26); assert.equal(noTurn.displacement, 26);
});
test('supported units convert to SI before bounds and calculation', () => {
  const r = input('uniform'); r.parameters.u = { value: 36, unit: 'km/h' }; r.parameters.duration = { value: 0.5, unit: 'min' }; r.parameters.x0 = { value: 0.1, unit: 'km' };
  const result = solve(r); assert.equal(result.distance, 300); assert.equal(result.finalPosition, 400);
  assert.equal(toSI(2, 'min', ['min']), 120);
  assert.throws(() => toSI(1, 'mph', ['m/s'])); assert.throws(() => toSI(1, 'km', ['m/s']));
});
test('every bound is inclusive; non-finite, unknown, missing and incompatible settings fail', () => {
  for (const experiment of EXPERIMENTS) {
    for (const p of experiment.parameters) {
      for (const value of [p.min, p.max]) assert.doesNotThrow(() => solve(input(experiment.id, { [p.key]: value })));
      for (const value of [p.min - 0.01, p.max + 0.01, NaN, Infinity, -Infinity]) assert.throws(() => solve(input(experiment.id, { [p.key]: value })));
    }
  }
  assert.throws(() => solve(input('uniform', { duration: 0 })));
  assert.throws(() => solve({ ...input('uniform'), parameters: { ...input('uniform').parameters, a: { value: 1, unit: 'm/s²' } } }));
  assert.throws(() => solve({ ...input('uniform'), scope: { classLevel: 10 } }));
  assert.throws(() => normalizeInput({ experimentId: 'projectile', parameters: {} }));
});
test('sampled position, distance and final summary share the same equation and precision', () => {
  const r = solve(input('acceleration', { u: -1, a: 0.5, duration: 7.7 }));
  for (const sample of r.samples) close(sample.position, -sample.t + 0.25 * sample.t ** 2);
  close(r.samples.at(-1)!.position, r.finalPosition); close(r.samples.at(-1)!.distance, r.distance);
  assert.deepEqual(solve(settingsAsInput(r.settings)), r);
  assert.equal(motionAt(r.settings, -5).t, 0); assert.equal(motionAt(r.settings, 1000).t, r.duration);
  assert.throws(() => motionAt(r.settings, NaN));
});
test('comparison eligibility checks fixed conditions and unequal durations', () => {
  const a = solve(input('uniform')), b = solve(input('uniform', { u: 8 }));
  assert.equal(comparison(a, b).twiceDistance, true); assert.equal(comparison(a, b).equalTime, true);
  const c = solve(input('uniform', { duration: 10 }));
  assert.equal(comparison(a, c).twiceDistance, false); assert.equal(comparison(a, c).equalTime, false);
  assert.throws(() => comparison(a, a)); assert.throws(() => comparison(a, solve(input('uniform', { u: 8, duration: 10 }))));
  assert.throws(() => comparison(a, solve(input('journey'))));
});
