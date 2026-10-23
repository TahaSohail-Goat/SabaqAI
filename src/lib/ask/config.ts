export function readAskConfig(env: Record<string, string | undefined> = process.env) {
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${key}; see docs/ask-evolution/IMPLEMENTATION.md.`);
    return n;
  };
  const flag = (key: string, fallback: boolean) => {
    const value = env[key];
    if (value !== undefined && value !== 'true' && value !== 'false') throw new Error(`Invalid ${key}.`);
    return value === undefined ? fallback : value === 'true';
  };
  return {
    understanding: flag('ASK_QUERY_UNDERSTANDING_ENABLED', true),
    expansion: flag('ASK_CONCEPT_EXPANSION_ENABLED', true),
    review: flag('ASK_SUPPORT_REVIEW_ENABLED', true),
    repair: flag('ASK_REPAIR_ENABLED', false),
    maxInput: integer('ASK_MAX_INPUT_CHARS', 1600, 100, 4000),
    seeds: integer('ASK_MAX_SEED_CHUNKS', 6, 1, 12),
    context: integer('ASK_MAX_CONTEXT_CHUNKS', 10, 1, 20),
    neighbors: integer('ASK_NEIGHBOR_WINDOW', 1, 0, 2),
    tokens: integer('ASK_MAX_CONTEXT_TOKENS', 7000, 500, 16000),
    outputTokens: integer('ASK_MAX_OUTPUT_TOKENS', 4000, 500, 8000),
    timeout: integer('ASK_TOTAL_TIMEOUT_MS', 110000, 5000, 120000),
    // Four routine stages plus, only when necessary, one repair and independent re-review.
    // Explicit lower budgets still win; the orchestrator reserves both repair slots.
    calls: integer('ASK_MAX_LLM_CALLS', 6, 2, 6),
    ttl: integer('ASK_CLARIFICATION_TTL_SECONDS', 600, 60, 1800),
  };
}
export type AskConfig = ReturnType<typeof readAskConfig>;

export class AskFailure extends Error {
  constructor(public code: 'invalid_request' | 'invalid_clarification' | 'rate_limited' | 'configuration' | 'unavailable' | 'invalid_output' | 'timeout', public httpStatus: number, public retryable = false) { super(code); }
}

export function checkDeadline(signal: AbortSignal) {
  if (signal.aborted) throw new AskFailure('timeout', 504, true);
}
