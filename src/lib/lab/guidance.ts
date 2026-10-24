import type { LabGuidance, LabInput, LabResult, LabRun } from '../types';
import { comparison, normalizeInput, suggestedInput, toSI } from './engine';
import { experimentById, formatValue, RESULT_LABELS } from './registry';
import { feedbackSchema, proposalSchema } from './contracts';

export const UNSUPPORTED_MESSAGE = 'This lab models straight-line uniform motion, constant acceleration, and two-leg journeys. Choose one of those experiments; the requested extra physics is outside these models.';
const clarifications = {
  experiment: 'Which motion do you want to test: constant velocity, constant acceleration, or a two-leg journey?',
  duration: 'How long does the motion last? Give a positive duration for each leg you want to test.',
  direction: 'Which direction does each part of the journey take? Right is positive; left is negative.',
  acceleration: 'Is the acceleration constant throughout the run? This lab supports constant acceleration only.',
};
export function validateProposal(raw: unknown, question?: string): { status: 'proposal'; input: LabInput; suggestedKeys: (keyof LabInput['parameters'])[] } | { status: 'clarify' | 'unsupported'; message: string } {
  const action = proposalSchema.parse(raw);
  if (action.action !== 'propose') {
    if (action.experimentId !== null || action.parameters.length || (action.action === 'clarify') !== (action.clarification !== null)) throw new Error('Incompatible routing action.');
    return action.action === 'unsupported' ? { status: 'unsupported', message: UNSUPPORTED_MESSAGE }
      : { status: 'clarify', message: clarifications[action.clarification!] };
  }
  if (!action.experimentId || action.clarification !== null) throw new Error('Incompatible proposal.');
  const experiment = experimentById(action.experimentId), input = suggestedInput(action.experimentId);
  const seen = new Set<string>();
  for (const item of action.parameters) {
    if (seen.has(item.key) || !experiment.parameters.some((p) => p.key === item.key)) throw new Error('Unknown or repeated parameter.');
    seen.add(item.key); input.parameters[item.key] = item.quantity;
  }
  normalizeInput(input);
  if (question) checkExplicitQuantities(question, action.parameters);
  return { status: 'proposal', input, suggestedKeys: experiment.parameters.filter((p) => !seen.has(p.key)).map((p) => p.key) };
}
function checkExplicitQuantities(question: string, parameters: { key: keyof LabInput['parameters']; quantity: LabInput['parameters']['u'] }[]) {
  const normalized = question.replace(/−/g, '-');
  const canonicalUnit = (raw: string): string => {
    const unit = raw.toLowerCase().replace(/\s+/g, ' ');
    if (/^met(?:er|re)s? per second(?: squared)?$/.test(unit)) return unit.endsWith(' squared') ? 'm/s²' : 'm/s';
    if (/^kilomet(?:er|re)s? per hour$/.test(unit)) return 'km/h';
    if (/^met(?:er|re)s?$/.test(unit)) return 'm';
    if (/^kilomet(?:er|re)s?$/.test(unit)) return 'km';
    if (/^seconds?$/.test(unit)) return 's';
    if (/^minutes?$/.test(unit)) return 'min';
    return unit === 'm/s^2' ? 'm/s²' : unit;
  };
  // Consume the entire numeric token: matching the 5 inside .5 or 1e5 would wrongly
  // authorize a model changing the student's condition. Long unit names precede bare m.
  const quantities = [...normalized.matchAll(/(?<![\p{L}\p{N}.,+\-])([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(m\/s(?:²|\^2)?|km\/h|met(?:er|re)s?\s+per\s+second(?:\s+squared)?|kilomet(?:er|re)s?\s+per\s+hour|seconds?|minutes?|metres?|meters?|kilometres?|kilometers?|min|km|s|m)(?![\p{L}\p{N}/^²])/giu)]
    .map((match) => ({ value: Number(match[1]), unit: canonicalUnit(match[2]) }));
  const startsAtRest = /\bfrom\s+rest\b|\b(?:starts?|begins?|initially)\s+(?:at\s+rest|stationary)\b/i.test(normalized);
  const compatible = (parameter: typeof parameters[number], quantity: typeof quantities[number]) => {
    const units = ['u', 'v2'].includes(parameter.key) ? ['m/s', 'km/h'] : ['duration', 'duration2'].includes(parameter.key) ? ['s', 'min'] : parameter.key === 'a' ? ['m/s²'] : ['m', 'km'];
    if (!units.includes(quantity.unit)) return false;
    const actual = toSI(parameter.quantity.value, parameter.quantity.unit, units), supplied = toSI(quantity.value, quantity.unit, units);
    return Math.abs(actual - supplied) < 1e-8 || (['u', 'v2'].includes(parameter.key) && /\b(left|backward|backwards|return)\b/i.test(question) && quantity.value >= 0 && Math.abs(actual + supplied) < 1e-8);
  };
  // Misread quantities must not silently become different supplied conditions. Code adds
  // omitted defaults separately, marks them as suggested, and requires confirmation.
  if ((startsAtRest && !parameters.some((parameter) => parameter.key === 'u' && parameter.quantity.value === 0))
    || quantities.some((quantity) => !parameters.some((parameter) => compatible(parameter, quantity)))
    || parameters.some((parameter) => !(startsAtRest && parameter.key === 'u' && parameter.quantity.value === 0)
      && !quantities.some((quantity) => compatible(parameter, quantity)))) throw new Error('Explicit quantities were changed or invented.');
}
// This narrow preflight prevents common out-of-model/instruction requests from spending a call.
// All model output is still validated. This is not claimed to be a general injection detector.
export function unsupportedQuestion(question: string): boolean {
  return /\b(collision|collisions|friction|projectile|orbit|orbital|magnetism|magnetic|circuit|voltage|electric current|pendulum|force|momentum|energy|jerk|mph)\b/i.test(question)
    || /ignore.{0,40}(instruction|rule|scope)|system prompt|api.key|execute|<script|dynamic import|override.{0,30}(solver|scope)/i.test(question);
}
export function defaultGuidance(run: LabRun): LabGuidance {
  const experiment = experimentById(run.result.settings.experimentId);
  return { personalized: false, message: 'Reviewed explanation · personalized AI guidance is unavailable.',
    blocks: [experiment.id, ...(run.result.turningTime !== null ? ['turning'] : [])],
    observations: [{ runId: run.id, field: experiment.prediction.field }], followupId: experiment.followups[0].id };
}
export function validateFeedback(raw: unknown, run: LabRun, baseline?: LabRun): LabGuidance {
  const action = feedbackSchema.parse(raw), experiment = experimentById(run.result.settings.experimentId);
  if (action.runId !== run.id || action.inputVersion !== run.inputVersion || action.solverVersion !== run.result.solverVersion || action.evidenceVersion !== run.evidenceVersion) throw new Error('Stale or fabricated run reference.');
  if (baseline) comparison(baseline.result, run.result);
  if (new Set(action.blocks).size !== action.blocks.length || action.blocks.some((id) => !experiment.blocks.includes(id) || (id === 'turning' && run.result.turningTime === null))) throw new Error('Unsupported explanation block.');
  if (!action.blocks.includes(experiment.id)) throw new Error('Explanation does not cover the selected experiment.');
  if (!experiment.followups.some((f) => f.id === action.followupId)) throw new Error('Unsupported follow-up.');
  if (action.observations.some((observation) => ![run.id, baseline?.id].includes(observation.runId) || !experiment.observations.includes(observation.field))) throw new Error('Fabricated observation.');
  return { personalized: true, message: 'AI selected these reviewed explanations for your question and prediction.', blocks: action.blocks,
    observations: action.observations, followupId: action.followupId };
}

export function explanationBlocks(result: LabResult): Record<string, string> {
  const p = result.settings.parameters;
  const v2 = p.v2 ?? 0;
  const journeyMeaning = p.u * v2 < 0
    ? 'The legs point in opposite directions, so their signed changes partly or fully cancel. The path lengths still add.'
    : p.u === 0 && v2 === 0 ? 'Both legs are stationary: time passes without a change in position.'
      : p.u === 0 || v2 === 0 ? 'A stationary leg adds elapsed time without adding path length.'
        : 'Both legs point in the same direction, so distance equals the magnitude of displacement.';
  return {
    uniform: `Velocity stays at ${formatValue(p.u)} m/s for ${formatValue(result.duration)} s. With no change in direction, distance grows at a steady rate: a larger speed covers more distance in the same time. Here the cart travels ${formatValue(result.distance)} m.`,
    acceleration: `Starting at ${formatValue(p.u)} m/s, the velocity changes by ${formatValue(p.a ?? 0)} m/s each second for ${formatValue(result.duration)} s. The final velocity is ${formatValue(result.finalVelocity)} m/s. Negative acceleration means velocity decreases; it does not always mean speed decreases.`,
    journey: `The two legs add ${formatValue(result.distance)} m to the total path, while the signed change from start to finish is ${formatValue(result.displacement)} m. The magnitude of displacement is ${formatValue(Math.abs(result.displacement))} m. ${journeyMeaning} The instantaneous change between legs is idealized; its acceleration is not simulated.`,
    turning: result.turningTime === null ? '' : `Velocity reaches zero at ${formatValue(result.turningTime)} s, then reverses. The engine adds the path lengths before and after this turn. That gives ${formatValue(result.distance)} m travelled and ${formatValue(result.displacement)} m displacement.`,
    signed: `Right is positive and left is negative. A negative velocity describes direction. Distance is non-negative, while displacement keeps its sign. The cart finishes at ${formatValue(result.finalPosition)} m relative to the chosen origin.`,
    graphs: 'Each graph uses the same equations as the cart and results table. A position–time slope gives signed velocity; a distance–time slope gives speed. A velocity–time slope gives acceleration wherever velocity changes continuously.',
  };
}
export function predictionFeedback(run: LabRun) {
  const goal = experimentById(run.result.settings.experimentId).prediction;
  const actual = run.result[goal.field];
  if (run.mode === 'exploration') return 'This was an exploration run. No prediction was recorded.';
  const difference = actual - run.prediction!;
  const matches = Math.abs(difference) <= Math.max(1e-8, Math.abs(actual) * 1e-8);
  const reflection = matches ? 'Your prediction matches this run.' : Math.abs(difference) < 0.001
    ? `The difference is smaller than 0.001 ${goal.unit} at this display precision.`
    : `The calculated value is ${formatValue(Math.abs(difference))} ${goal.unit} ${difference >= 0 ? 'above' : 'below'} your prediction.`;
  return `You predicted ${formatValue(run.prediction!)} ${goal.unit} for ${RESULT_LABELS[goal.field].label.toLowerCase()}. The calculation gives ${formatValue(actual)} ${goal.unit}. ${reflection} One prediction is a starting point for discussion, not a measure of mastery.`;
}
export function comparisonTeaching(a: LabResult, b: LabResult) {
  const c = comparison(a, b), experiment = experimentById(a.settings.experimentId);
  const changed = experiment.parameters.find((p) => p.key === c.changed)!;
  return `Only ${changed.label.toLowerCase()} changed: ${formatValue(a.settings.parameters[c.changed]!)} → ${formatValue(b.settings.parameters[c.changed]!)} ${changed.unit}. `
    + `Held fixed: ${c.fixed.map((p) => `${p.label.toLowerCase()} ${formatValue(p.value)} ${p.unit}`).join(', ')}. `
    + (c.twiceDistance ? 'With duration fixed, doubling speed doubled the distance. ' : '')
    + (c.equalTime ? 'Both runs use the same elapsed time. ' : 'Elapsed times differ; their endpoints are not an equal-time comparison. ')
    + `Distance changed by ${formatValue(c.distanceDifference)} m; displacement changed by ${formatValue(c.displacementDifference)} m.`;
}
