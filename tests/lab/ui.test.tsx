import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionGraph, MotionScene } from '../../src/components/lab/LabVisuals';
import { solve, suggestedInput } from '../../src/lib/lab/engine';

test('graphs expose quantity, SI axes and comparison legend without animation', () => {
  const a = solve(suggestedInput('uniform')), input = suggestedInput('uniform'); input.parameters.u.value = 8;
  const html = renderToStaticMarkup(<MotionGraph result={solve(input)} baseline={a} />);
  assert.match(html, /Position \(m\)/); assert.match(html, /Time \(s\)/); assert.match(html, /Run A/); assert.match(html, /Run B/); assert.match(html, /stroke-dasharray="7 4"/);
});
test('scene has labelled accessible manual clock and pause/replay/reset controls', () => {
  const html = renderToStaticMarkup(<MotionScene result={solve(suggestedInput('journey'))} runKey="test" />);
  for (const label of ['Simulation time', 'Play animation', 'Replay', 'Reset', 'shared scale', 'tab is hidden']) assert.ok(html.includes(label), label);
});
