import { z } from 'zod';
import { getGeminiClient } from '../gemini';
import { AskFailure, checkDeadline, type AskConfig } from './config';
import { providerJsonSchema } from './provider-schema';

export interface AskProvider {
  json(stage: 'understanding' | 'sufficiency' | 'explanation' | 'review' | 'repair', instruction: string, payload: unknown, schema: z.ZodType): Promise<unknown>;
  countTokens(instruction: string, payload: unknown): Promise<number>;
  readonly calls: number;
}

export function createAskProvider(config: AskConfig, signal: AbortSignal): AskProvider {
  const ai = getGeminiClient();
  if (!ai) throw new AskFailure('configuration', 503);
  const model = process.env.CHAT_MODEL || 'gemini-3.5-flash-lite';
  let calls = 0;
  return {
    get calls() { return calls; },
    async json(_stage, instruction, payload, schema) {
      checkDeadline(signal);
      if (calls >= config.calls) throw new AskFailure('unavailable', 503, true);
      calls++;
      try {
        const response = await ai.models.generateContent({
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
        console.warn('[ask-provider]', JSON.stringify({ stage: _stage, status, schemaRejected: /schema|too many states|INVALID_ARGUMENT/i.test(message), quotaLimited: /RESOURCE_EXHAUSTED|quota|rate.limit/i.test(message) }));
        throw new AskFailure('unavailable', 503, true);
      }
    },
    async countTokens(instruction, payload) {
      checkDeadline(signal);
      try {
        const response = await ai.models.countTokens({
          model, contents: instruction + '\n' + JSON.stringify(payload),
          config: { abortSignal: signal, httpOptions: { timeout: config.timeout, retryOptions: { attempts: 1 } } },
        });
        if (!Number.isFinite(response.totalTokens) || response.totalTokens! <= 0) throw new AskFailure('invalid_output', 502, true);
        return response.totalTokens!;
      } catch (error) {
        if (error instanceof AskFailure) throw error;
        checkDeadline(signal);
        throw new AskFailure('unavailable', 503, true);
      }
    },
  };
}
