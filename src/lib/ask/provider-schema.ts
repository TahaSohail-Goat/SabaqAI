import { z } from 'zod';

// Gemini can reject bounded, nested array grammars as too complex. Keep the wire shape
// simple; the full Zod schema remains mandatory after generation (including every bound).
// https://ai.google.dev/gemini-api/docs/structured-output
export function providerJsonSchema(schema: z.ZodType): unknown {
  const runtimeOnly = new Set(['$schema', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']);
  const simplify = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(simplify);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !runtimeOnly.has(key)).map(([key, entry]) => [key, simplify(entry)]));
    return value;
  };
  return simplify(z.toJSONSchema(schema, { unrepresentable: 'any' }));
}
