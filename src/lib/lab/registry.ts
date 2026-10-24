import type { LabExperimentId, LabParameterKey, LabResultField, LabUnit } from '../types';

export const REGISTRY_VERSION = 'kinematics-1.0.0';
export const SOLVER_VERSION = 'straight-line-1.0.0';
export const EVIDENCE_VERSION = 'fbise9-kinematics-2026-10-24';
export const LAB_SCOPE = { board: 'FBISE', classLevel: 9, subject: 'physics', chapterNo: 2,
  sourceId: 'a97af255-a158-41a0-9e9f-b341c7c0c059' } as const;
export const OPENSTAX_URL = 'https://openstax.org/books/college-physics-2e/pages/2-5-motion-equations-for-constant-acceleration-in-one-dimension';

export interface LabParameter {
  key: LabParameterKey; label: string; unit: LabUnit; units: readonly LabUnit[];
  min: number; max: number; step: number; suggested: number;
}
export interface LabExperiment {
  id: LabExperimentId; title: string; eyebrow: string; description: string;
  intents: readonly string[]; parameters: readonly LabParameter[]; equations: readonly string[];
  assumptions: readonly string[]; evidenceKeys: readonly string[]; observations: readonly LabResultField[];
  prediction: { field: LabResultField; prompt: string; unit: string };
  followups: readonly { id: string; label: string; parameter: LabParameterKey }[];
  blocks: readonly string[];
  scope: typeof LAB_SCOPE; registryVersion: string; solverVersion: string;
}
const position: LabParameter = { key: 'x0', label: 'Starting position', unit: 'm', units: ['m', 'km'], min: -100, max: 100, step: 1, suggested: 0 };
const velocity: LabParameter = { key: 'u', label: 'Velocity', unit: 'm/s', units: ['m/s', 'km/h'], min: -30, max: 30, step: 0.5, suggested: 4 };
const duration: LabParameter = { key: 'duration', label: 'Duration', unit: 's', units: ['s', 'min'], min: 0.1, max: 30, step: 0.1, suggested: 5 };
const observations: readonly LabResultField[] = ['duration', 'distance', 'displacement', 'finalPosition', 'finalVelocity', 'averageSpeed', 'averageVelocity'];
const shared = { scope: LAB_SCOPE, registryVersion: REGISTRY_VERSION, solverVersion: SOLVER_VERSION, observations };
export const EXPERIMENTS: readonly LabExperiment[] = [
  { ...shared, id: 'uniform', title: 'Steady on the straight', eyebrow: '01 · Uniform motion',
    description: 'Keep velocity constant. Find out how speed and time shape a journey.',
    intents: ['constant speed', 'uniform velocity', 'speed time distance', 'negative velocity'],
    parameters: [position, velocity, duration], equations: ['x(t) = x₀ + vt', 'distance = |v|t'],
    assumptions: ['Motion is along one straight line; right is positive.', 'Velocity stays constant. Forces and air resistance are outside this model.'],
    evidenceKeys: ['distance', 'speed', 'velocity', 'graphs'], blocks: ['uniform', 'signed', 'graphs'],
    prediction: { field: 'distance', prompt: 'How much distance will the cart travel?', unit: 'm' },
    followups: [{ id: 'change-speed', label: 'Change velocity, keep duration fixed', parameter: 'u' }, { id: 'change-time', label: 'Change duration, keep velocity fixed', parameter: 'duration' }] },
  { ...shared, id: 'acceleration', title: 'A change of pace', eyebrow: '02 · Constant acceleration',
    description: 'Speed up, slow down, or turn around. Trace a changing velocity.',
    intents: ['constant acceleration', 'deceleration', 'braking', 'turning point', 'final velocity'],
    parameters: [position, { ...velocity, label: 'Initial velocity', suggested: 2 },
      { key: 'a', label: 'Acceleration', unit: 'm/s²', units: ['m/s²'], min: -10, max: 10, step: 0.5, suggested: 2 }, duration],
    equations: ['v(t) = u + at', 'x(t) = x₀ + ut + ½at²', 'distance = sum of |displacement| between turning points'],
    assumptions: ['Motion is along one straight line; right is positive.', 'Acceleration is constant for the entire run. The cart may reverse after stopping.'],
    evidenceKeys: ['distance', 'velocity', 'acceleration', 'velocity-graph'], blocks: ['acceleration', 'turning', 'signed', 'graphs'],
    prediction: { field: 'finalVelocity', prompt: 'What will the final velocity be? Include its sign.', unit: 'm/s' },
    followups: [{ id: 'change-acceleration', label: 'Change acceleration, keep initial velocity and time fixed', parameter: 'a' }, { id: 'change-initial', label: 'Change initial velocity, keep acceleration and time fixed', parameter: 'u' }, { id: 'change-time', label: 'Change duration, keep initial velocity and acceleration fixed', parameter: 'duration' }] },
  { ...shared, id: 'journey', title: 'There and back', eyebrow: '03 · Distance & displacement',
    description: 'Travel in two legs. Does coming back undo the distance you travelled?',
    intents: ['two leg journey', 'return trip', 'distance vs displacement', 'average speed and velocity'],
    parameters: [position, { ...velocity, label: 'First-leg velocity' }, { ...duration, label: 'First-leg duration' },
      { ...velocity, key: 'v2', label: 'Second-leg velocity', suggested: -4 }, { ...duration, key: 'duration2', label: 'Second-leg duration' }],
    equations: ['distance = |v₁|t₁ + |v₂|t₂', 'displacement = v₁t₁ + v₂t₂', 'average speed = distance / (t₁ + t₂)', 'average velocity = displacement / (t₁ + t₂)'],
    assumptions: ['Each leg has constant signed velocity on the same straight line.', 'The instantaneous velocity change between legs is an idealization. Acceleration at that instant is not simulated.'],
    evidenceKeys: ['distance', 'speed', 'velocity', 'averages'], blocks: ['journey', 'signed', 'graphs'],
    prediction: { field: 'displacement', prompt: 'What will the signed displacement be after both legs?', unit: 'm' },
    followups: [{ id: 'change-return', label: 'Change second-leg velocity, keep both durations fixed', parameter: 'v2' }, { id: 'change-return-time', label: 'Change second-leg duration, keep both velocities fixed', parameter: 'duration2' }] },
];
export function experimentById(id: LabExperimentId): LabExperiment {
  const experiment = EXPERIMENTS.find((entry) => entry.id === id);
  if (!experiment) throw new Error('Choose an experiment from the Concept Lab catalogue.');
  return experiment;
}
export const RESULT_LABELS: Record<LabResultField, { label: string; unit: string }> = {
  duration: { label: 'Elapsed time', unit: 's' }, distance: { label: 'Total distance', unit: 'm' },
  displacement: { label: 'Displacement', unit: 'm' }, finalPosition: { label: 'Final position', unit: 'm' },
  finalVelocity: { label: 'Final velocity', unit: 'm/s' }, averageSpeed: { label: 'Average speed', unit: 'm/s' }, averageVelocity: { label: 'Average velocity', unit: 'm/s' },
};
export const formatValue = (value: number): string => (Math.abs(value) < 1e-9 ? 0 : value).toLocaleString('en', { maximumFractionDigits: 3 });
