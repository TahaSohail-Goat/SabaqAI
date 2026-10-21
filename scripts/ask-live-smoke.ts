// Opt-in only. Synthetic review questions, real configured corpus/provider, no DB writes.
import { readAskConfig, AskFailure } from '../src/lib/ask/config';
import { createAskProvider } from '../src/lib/ask/provider';
import { liveAskRetrieval } from '../src/lib/ask/evidence';
import { runAsk, newTrace } from '../src/lib/ask/orchestrator';
import { UNDERSTANDING_VERSION } from '../src/prompts/question-understanding';
import { TEACHING_VERSION } from '../src/prompts/grounded-answer';

async function main() {
  if (!process.argv.includes('--live')) throw new Error('Explicit --live is required. Uses configured provider quota; see docs/ask-evolution/EVALUATION.md.');
  const question = process.argv.find((arg) => arg.startsWith('--question='))?.slice('--question='.length) ?? "Explain Ohm's law at constant temperature with a simple example.";
  const arg = (key: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
  const config = readAskConfig();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), config.timeout);
  const trace = newTrace(), started = Date.now();
  const provider = createAskProvider(config, controller.signal);
  try {
    const result = await runAsk({ question, board: 'FBISE', classLevel: Number(arg('class', '10')), subject: arg('subject', 'physics'), sourceType: 'textbook', language: arg('language', 'en'),
      ...(arg('chapter', '') ? { chapterNo: Number(arg('chapter', '')) } : {}) },
      { provider, retrieval: liveAskRetrieval, config, signal: controller.signal, requestId: 'live-smoke', owner: 'local-review', trace });
    console.log(JSON.stringify({ status: result.status, ...(result.status === 'answered' ? { citationCount: result.citations.length, pages: result.citations.map((c) => c.pageFrom) } : {}),
      model: process.env.CHAT_MODEL || 'gemini-3.5-flash-lite', understandingPrompt: UNDERSTANDING_VERSION, teachingPrompt: TEACHING_VERSION,
      calls: provider.calls, latencyMs: Date.now() - started, trace }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ status: 'error', code: error instanceof AskFailure ? error.code : 'unavailable', model: process.env.CHAT_MODEL || 'gemini-3.5-flash-lite', calls: provider.calls, latencyMs: Date.now() - started, trace }, null, 2));
    process.exitCode = 1;
  } finally { clearTimeout(timer); }
}
void main();
