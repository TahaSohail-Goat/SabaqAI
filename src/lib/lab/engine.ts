import { z } from 'zod';
import type { LabInput, LabParameters, LabResult, LabSettings, LabSample } from '../types';
import { experimentById, SOLVER_VERSION } from './registry';

export const parameterKeySchema = z.enum(['x0', 'u', 'a', 'duration', 'v2', 'duration2']);
export const experimentIdSchema = z.enum(['uniform', 'acceleration', 'journey']);
export const quantitySchema = z.object({ value: z.number().finite(), unit: z.enum(['m', 'km', 'm/s', 'km/h', 's', 'min', 'm/s²']) }).strict();
export const labInputSchema = z.object({ experimentId: experimentIdSchema,
  parameters: z.object({ x0: quantitySchema, u: quantitySchema, duration: quantitySchema, a: quantitySchema.optional(), v2: quantitySchema.optional(), duration2: quantitySchema.optional() }).strict(),
}).strict();

const conversions: Record<string, number> = { m: 1, km: 1000, 'm/s': 1, 'km/h': 1 / 3.6, s: 1, min: 60, 'm/s²': 1 };
export function toSI(value: number, unit: string, accepted: readonly string[]): number {
  if (!Number.isFinite(value) || !accepted.includes(unit) || !(unit in conversions)) throw new Error('Enter a finite value with an explicitly supported unit.');
  return value * conversions[unit];
}
export function normalizeInput(raw: unknown): LabSettings {
  const input = labInputSchema.parse(raw);
  const definition = experimentById(input.experimentId);
  const keys = definition.parameters.map((parameter) => parameter.key);
  if (Object.keys(input.parameters).some((key) => !keys.includes(key as typeof keys[number]))) throw new Error('These settings belong to another experiment.');
  const values: Partial<LabParameters> = {};
  for (const parameter of definition.parameters) {
    const quantity = input.parameters[parameter.key];
    if (!quantity) throw new Error(`Enter ${parameter.label.toLowerCase()}.`);
    const value = toSI(quantity.value, quantity.unit, parameter.units);
    if (value < parameter.min || value > parameter.max) throw new Error(`${parameter.label} must be between ${parameter.min} and ${parameter.max} ${parameter.unit}.`);
    values[parameter.key] = value;
  }
  return { experimentId: input.experimentId, parameters: values as LabParameters };
}
export function suggestedInput(id: LabInput['experimentId']): LabInput {
  return { experimentId: id, parameters: Object.fromEntries(experimentById(id).parameters.map((p) => [p.key, { value: p.suggested, unit: p.unit }])) as LabInput['parameters'] };
}
export function settingsAsInput(settings: LabSettings): LabInput {
  return { experimentId: settings.experimentId, parameters: Object.fromEntries(experimentById(settings.experimentId).parameters.map((p) => [p.key, { value: settings.parameters[p.key]!, unit: p.unit }])) as LabInput['parameters'] };
}
export function motionAt(settings: LabSettings, rawTime: number): LabSample {
  const { x0, u, duration, a = 0, v2 = 0, duration2 = 0 } = settings.parameters;
  const end = duration + (settings.experimentId === 'journey' ? duration2 : 0);
  if (!Number.isFinite(rawTime)) throw new Error('Simulation time must be finite.');
  const t = Math.max(0, Math.min(rawTime, end));
  if (settings.experimentId === 'journey') {
    const first = Math.min(t, duration), second = Math.max(0, t - duration);
    return { t, position: x0 + u * first + v2 * second, velocity: t < duration ? u : v2,
      distance: Math.abs(u) * first + Math.abs(v2) * second, acceleration: null };
  }
  const acceleration = settings.experimentId === 'acceleration' ? a : 0;
  const displacementAt = (time: number) => u * time + 0.5 * acceleration * time * time;
  const turning = acceleration === 0 ? -1 : -u / acceleration;
  const displacement = displacementAt(t);
  const distance = turning > 0 && turning < t
    ? Math.abs(displacementAt(turning)) + Math.abs(displacement - displacementAt(turning)) : Math.abs(displacement);
  return { t, position: x0 + displacement, velocity: u + acceleration * t, distance, acceleration };
}
export function solve(raw: unknown): LabResult {
  const settings = normalizeInput(raw);
  const { x0, u, a = 0, duration, duration2 = 0 } = settings.parameters;
  const total = duration + (settings.experimentId === 'journey' ? duration2 : 0);
  const end = motionAt(settings, total);
  const turn = settings.experimentId === 'acceleration' && a !== 0 ? -u / a : -1;
  const turningTime = turn > 0 && turn < total ? turn : null;
  const times = Array.from({ length: 121 }, (_, i) => total * i / 120);
  if (turningTime !== null) times.push(turningTime);
  if (settings.experimentId === 'journey') times.push(duration);
  const samples = [...new Set(times)].sort((l, r) => l - r).map((t) => motionAt(settings, t));
  return { settings, solverVersion: SOLVER_VERSION, duration: total, distance: end.distance,
    displacement: end.position - x0, finalPosition: end.position, finalVelocity: end.velocity,
    averageSpeed: end.distance / total, averageVelocity: (end.position - x0) / total, turningTime, samples };
}
export function changedParameters(a: LabSettings, b: LabSettings) {
  if (a.experimentId !== b.experimentId) throw new Error('Compare two runs of the same experiment.');
  return experimentById(a.experimentId).parameters.filter((p) => Math.abs(a.parameters[p.key]! - b.parameters[p.key]!) > 1e-9).map((p) => p.key);
}
export function comparison(a: LabResult, b: LabResult) {
  const changed = changedParameters(a.settings, b.settings);
  if (changed.length !== 1) throw new Error('Change exactly one setting to make a controlled comparison.');
  const fixed = experimentById(a.settings.experimentId).parameters.filter((p) => p.key !== changed[0]);
  const twiceDistance = a.settings.experimentId === 'uniform' && changed[0] === 'u' && a.distance > 0
    && Math.abs(b.distance / a.distance - 2) < 1e-9;
  return { changed: changed[0], fixed: fixed.map((p) => ({ label: p.label, value: a.settings.parameters[p.key]!, unit: p.unit })),
    distanceDifference: b.distance - a.distance, displacementDifference: b.displacement - a.displacement,
    equalTime: Math.abs(a.duration - b.duration) < 1e-9, twiceDistance };
}
