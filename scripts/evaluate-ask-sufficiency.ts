// Explicit, bounded paid-provider probe. No account data, QA logging or database writes.
// Set the existing ignored local env in the invoking shell; never paste credentials here.
import { writeFileSync } from 'node:fs';
import type { AskResponse } from '../src/lib/types';

async function main() {
  if (!process.argv.includes('--live')) throw new Error('Requires --live: bounded real retrieval/provider checks, not the full catalogue.');
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(supabaseUrl.hostname))
    throw new Error('This probe requires the existing local Supabase instance.');
  const { runAsk, newTrace } = require('../src/lib/ask/orchestrator') as typeof import('../src/lib/ask/orchestrator');
  const { readAskConfig } = require('../src/lib/ask/config') as typeof import('../src/lib/ask/config');
  const { liveAskRetrieval, scoredEvidence } = require('../src/lib/ask/evidence') as typeof import('../src/lib/ask/evidence');
  const { evaluateConfidence } = require('../src/lib/ai/guardrail') as typeof import('../src/lib/ai/guardrail');
  const { createAskProvider } = require('../src/lib/ask/provider') as typeof import('../src/lib/ask/provider');
  const scope = { board: 'FBISE', classLevel: 9, subject: 'physics', sourceType: 'textbook', chapterNo: 3,
    sourceId: '81855080-15fb-4971-b9da-5f1ddb616f74' };
  const cases = [
    { id: 'reported', question: 'how non contact forces work?', expected: 'partial' },
    { id: 'definition', question: 'What is a non-contact force?', expected: 'answered' },
    { id: 'paraphrase', question: 'How can objects push or pull each other without touching? Give textbook examples.', expected: 'answered' },
    { id: 'partial', question: 'What are non-contact forces? Give two textbook examples, then derive their exact force-distance equations.', expected: 'partial' },
    { id: 'unsupported-theory', question: 'Derive the Einstein field equations of general relativity for gravity.', expected: 'refused' },
    { id: 'misleading-keywords', question: 'How does a magnetic hard disk use non-contact forces to encode individual bits? Explain its storage mechanism.', expected: 'refused' },
    { id: 'wrong-topic', question: 'What exact dose of an antibiotic cures a bacterial infection?', expected: 'refused' },
    { id: 'negation', question: 'Are all non-contact forces always attractive? Explain using textbook examples.', expected: 'answered' },
    { id: 'unsupported-calculation', question: 'Calculate the Earth-Moon gravitational force to six significant figures using quantum gravity.', expected: 'refused' },
  ];
  const selected = process.argv.find((arg) => arg.startsWith('--cases='))?.slice(8).split(',');
  if (selected?.some((id) => !cases.some((c) => c.id === id))) throw new Error('Unknown probe case.');
  const label = process.argv.find((arg) => arg.startsWith('--label='))?.slice(8) ?? 'results';
  if (!/^[a-z-]+$/.test(label)) throw new Error('Invalid output label.');
  const results = [];
  for (const item of cases.filter((c) => !selected || selected.includes(c.id))) {
    const config = readAskConfig();
    const signal = AbortSignal.timeout(config.timeout);
    const provider = createAskProvider(config, signal), trace = newTrace();
    const providerOutputs: { stage: string; output: unknown }[] = [];
    const json = provider.json;
    provider.json = async (...args) => {
      const output = await json(...args);
      providerOutputs.push({ stage: args[0], output });
      return output;
    };
    let scoreOnlyDecision: ReturnType<typeof evaluateConfidence> | undefined;
    const started = performance.now();
    let result: AskResponse | undefined, error: string | undefined;
    try {
      result = await runAsk({ ...scope, question: item.question, language: 'en' }, {
        provider, retrieval: liveAskRetrieval, config, signal, trace,
        owner: 'local-sufficiency-probe', requestId: `sufficiency-${item.id}`,
        log: async (entry) => { scoreOnlyDecision = evaluateConfidence(scoredEvidence(entry.evidence)); },
      });
    } catch (failure) { error = failure instanceof Error ? failure.message : 'unknown failure'; }
    const actual = result?.status === 'answered' && result.boundary?.coverage === 'partial' ? 'partial' : result?.status ?? 'error';
    const record = { ...item, actual, matchesExpectedStatus: actual === item.expected, scoreOnlyDecision,
      latencyMs: Math.round(performance.now() - started), providerCalls: provider.calls, trace, result, error, providerOutputs };
    results.push(record);
    console.info(JSON.stringify({ id: item.id, expected: item.expected, actual, scoreOnlyDecision,
      latencyMs: record.latencyMs, assessmentMs: trace.durations.evidence_sufficiency, providerCalls: provider.calls }));
    writeFileSync(`.recovery/sufficiency-live-${label}.json`, JSON.stringify({
      executedAt: new Date().toISOString(), scope, databaseWrites: 0,
      note: 'Real local retrieval + live Gemini. Status comparison is not independent factual grading. scoreOnlyDecision is a counterfactual gate on the same final evidence, not an executed old endpoint.',
      results,
    }, null, 2) + '\n');
    if (error) break; // Do not spend more quota after an operational provider failure.
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Probe failed'); process.exitCode = 1; });
