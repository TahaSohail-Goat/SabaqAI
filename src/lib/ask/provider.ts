import { z } from 'zod';
import { getGeminiClient } from '../gemini';
import { AskFailure, checkDeadline, type AskConfig } from './config';
import { providerJsonSchema } from './provider-schema';
import { AskTransientProviderFailure, providerRetryCode } from './transport';
import { CHAT_MODELS } from '../chat/models';

export interface AskProvider {
  json(stage: 'understanding' | 'sufficiency' | 'explanation' | 'review' | 'repair', instruction: string, payload: unknown, schema: z.ZodType): Promise<unknown>;
  countTokens(instruction: string, payload: unknown): Promise<number>;
  readonly calls: number;
  readonly providerName?: 'gemini' | 'groq';
  readonly tokenCountMode?: 'exact' | 'estimate_with_usage_check';
}

export function createAskProvider(config: AskConfig, signal: AbortSignal, options: {
  env?: Record<string, string | undefined>; gemini?: ReturnType<typeof getGeminiClient>; fetch?: typeof fetch;
} = {}): AskProvider {
  const env = options.env ?? process.env;
  const ai = options.gemini === undefined ? getGeminiClient() : options.gemini;
  const groqKey = env.GROQ_API_KEY;
  if (!ai && !groqKey) throw new AskFailure('configuration', 503);
  const model = env.CHAT_MODEL || 'gemini-3.5-flash-lite';
  const groqModel = CHAT_MODELS.find((entry) => entry.provider === 'groq')!.id;
  const request = options.fetch ?? fetch;
  let active: 'gemini' | 'groq' = ai ? 'gemini' : 'groq';
  let calls = 0;
  const switchOnFailure = (error: unknown): never => {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    const retryCode = providerRetryCode(error) ?? (status === 429 && active === 'gemini' && groqKey ? 'HTTP_429' : null);
    if (active === 'gemini' && groqKey && retryCode) {
      active = 'groq';
      console.warn('[ask-provider]', JSON.stringify({ fallback: 'groq', retryCode }));
    }
    // The orchestrator owns the single retry and counts its attempt. Never make a hidden call.
    if (retryCode) throw new AskTransientProviderFailure(retryCode);
    throw new AskFailure('unavailable', 503, true);
  };
  return {
    get calls() { return calls; },
    get providerName() { return active; },
    get tokenCountMode() { return active === 'gemini' ? 'exact' : 'estimate_with_usage_check'; },
    async json(_stage, instruction, payload, schema) {
      checkDeadline(signal);
      if (calls >= config.calls) throw new AskFailure('unavailable', 503, true);
      calls++;
      try {
        if (active === 'groq') {
          const messages = [{ role: 'system', content: instruction }, { role: 'user', content: JSON.stringify(payload) }];
          // Bound bytes before sending. Exact Groq usage below is authoritative; a Gemini
          // count or local estimate must never authorize an over-budget Groq answer.
          if (Buffer.byteLength(JSON.stringify(messages), 'utf8') > 100000) throw new AskFailure('invalid_output', 502, true);
          const response = await request('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST', headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            signal, body: JSON.stringify({ model: groqModel, messages, temperature: 0.1,
              reasoning_effort: 'low', max_completion_tokens: config.outputTokens,
              response_format: { type: 'json_schema', json_schema: { name: 'ask_' + _stage, strict: true, schema: providerJsonSchema(schema) } } }),
          });
          if (!response.ok) throw Object.assign(new Error('Groq request failed'), { status: response.status });
          const result = await response.json() as { choices?: { finish_reason?: string; message?: { content?: string } }[]; usage?: { prompt_tokens?: number } };
          checkDeadline(signal);
          const tokens = result.usage?.prompt_tokens;
          if (!Number.isInteger(tokens) || tokens! <= 0 || tokens! > config.tokens) throw new AskFailure('invalid_output', 502, true);
          const choice = result.choices?.[0], content = choice?.message?.content;
          if (choice?.finish_reason !== 'stop' || !content || content.length > 100000) throw new AskFailure('invalid_output', 502, true);
          try { return schema.parse(JSON.parse(content)); } catch { throw new AskFailure('invalid_output', 502, true); }
        }
        const response = await ai!.models.generateContent({
          model, contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
          config: {
            systemInstruction: instruction, temperature: 0.1, responseMimeType: 'application/json',
            responseJsonSchema: providerJsonSchema(schema),
            maxOutputTokens: config.outputTokens, abortSignal: signal,
            httpOptions: { timeout: config.timeout, retryOptions: { attempts: 1 } },
          },
        });
        checkDeadline(signal);
        if (!response.text || response.text.length > 100000) throw new AskFailure('invalid_output', 502, true);
        try { return JSON.parse(response.text); } catch { throw new AskFailure('invalid_output', 502, true); }
      } catch (error) {
        if (error instanceof AskFailure) throw error;
        checkDeadline(signal);
        const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
        const message = error instanceof Error ? error.message : '';
        const retryCode = providerRetryCode(error);
        console.warn('[ask-provider]', JSON.stringify({ stage: _stage, status, retryCode, schemaRejected: /schema|too many states|INVALID_ARGUMENT/i.test(message), quotaLimited: /RESOURCE_EXHAUSTED|quota|rate.limit/i.test(message) }));
        return switchOnFailure(error);
      }
    },
    async countTokens(instruction, payload) {
      checkDeadline(signal);
      if (active === 'groq') {
        // Planning estimate, NOT an exact tokenizer. The completion's required usage field
        // enforces the real limit before any output can enter validation or reach a student.
        return Math.ceil(Buffer.byteLength(instruction + '\n' + JSON.stringify(payload), 'utf8') / 3) + 128;
      }
      try {
        const response = await ai!.models.countTokens({
          model, contents: instruction + '\n' + JSON.stringify(payload),
          config: { abortSignal: signal, httpOptions: { timeout: config.timeout, retryOptions: { attempts: 1 } } },
        });
        if (!Number.isFinite(response.totalTokens) || response.totalTokens! <= 0) throw new AskFailure('invalid_output', 502, true);
        return response.totalTokens!;
      } catch (error) {
        if (error instanceof AskFailure) throw error;
        checkDeadline(signal);
        const retryCode = providerRetryCode(error);
        console.warn('[ask-provider]', JSON.stringify({ stage: 'token_count', retryCode }));
        return switchOnFailure(error);
      }
    },
  };
}
