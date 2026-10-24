import { z } from 'zod';
import { createAskProvider, type AskProvider } from '../ask/provider';
import { readAskConfig } from '../ask/config';
import { AskTransientProviderFailure } from '../ask/transport';

export interface LabProvider { json(instruction: string, payload: unknown, schema: z.ZodType): Promise<unknown> }
export function createLabProvider(signal: AbortSignal): LabProvider {
  // Reuse the working transport/models while keeping Lab prompts, budgets and evidence separate.
  const provider = createAskProvider({ ...readAskConfig(), calls: 2, tokens: 7000, outputTokens: 1200, timeout: 20000 }, signal);
  return boundedLabProvider(provider, signal);
}
export function boundedLabProvider(provider: AskProvider, signal: AbortSignal): LabProvider {
  return { async json(instruction, payload, schema) {
    if (signal.aborted) throw new Error('Lab provider request cancelled.');
    if (JSON.stringify(payload).length > 20000) throw new Error('Lab provider input exceeds its bound.');
    const first = provider.providerName;
    const started = Date.now();
    try { return schema.parse(await provider.json('understanding', instruction, payload, schema)); }
    catch (error) {
      // Exactly one fallback, only when transport/429 switched Gemini to configured Groq.
      // Invalid science/schema, cancellation and deadlines never switch providers.
      if (!(error instanceof AskTransientProviderFailure) || first !== 'gemini' || provider.providerName !== 'groq' || signal.aborted) throw error;
      return schema.parse(await provider.json('understanding', instruction, payload, schema));
    } finally { console.info('[lab-provider]', JSON.stringify({ provider: provider.providerName, calls: provider.calls, latencyMs: Date.now() - started })); }
  } };
}
