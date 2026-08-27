// Evaluation CLI. Same labelled set and same scoring as /api/eval — both call runEvaluation(),
// so the dashboard and this script can never report different numbers for the same system.
//
//   npm run eval
//
// See docs/evaluation.md for what each metric means and how to calibrate thresholds against them.

import { runEvaluation } from '../src/lib/evaluation/run';

const pad = (v: string | number, n: number) => String(v).padEnd(n);

async function main(): Promise<void> {
  console.log('Sabaq AI — evaluation');
  console.log('='.repeat(96));

  const { summary, results } = await runEvaluation();

  console.log(
    pad('ID', 9) + pad('Type', 16) + pad('Top1', 8) +
    pad('Supp', 6) + pad('Decision', 12) + pad('Result', 9) + 'Question'
  );
  console.log('-'.repeat(96));

  for (const r of results) {
    const type = r.label === 'in_syllabus' ? 'in-syllabus' : r.nearMiss ? 'NEAR-MISS' : 'off-syllabus';
    console.log(
      pad(r.id, 9) +
      pad(type, 16) +
      pad(r.top1Score.toFixed(3), 8) +
      pad(r.supportCount, 6) +
      pad(r.decision, 12) +
      pad(r.passedVerification ? 'ok' : 'FAIL', 9) +
      r.question.slice(0, 44)
    );
  }

  console.log('\n' + '='.repeat(96));
  console.log(`Retrieval accuracy (in-syllabus):   ${summary.retrievalAccuracy}%  (${summary.inSyllabusTotal} questions)`);
  console.log(`Refusal rate (all off-syllabus):    ${summary.offSyllabusRefusalRate}%  (${summary.outSyllabusTotal} questions)`);
  console.log(`Refusal rate (NEAR-MISS only):      ${summary.nearMissRefusalRate}%  (${summary.nearMissTotal} questions)  <- the number that matters`);
  console.log(`False acceptance (leakage):         ${summary.falseAcceptanceRate}%`);
  console.log(`False refusal:                      ${summary.falseRefusalRate}%`);
  console.log('-'.repeat(96));
  console.log(
    `Thresholds: PASS_TOP1=${summary.thresholds.PASS_TOP1}  ` +
    `BORDERLINE_TOP1=${summary.thresholds.BORDERLINE_TOP1}  ` +
    `SUPPORT_SCORE=${summary.thresholds.SUPPORT_SCORE}`
  );

  const failures = results.filter((r) => !r.passedVerification);
  if (failures.length > 0) {
    console.log(`\n${failures.length} question(s) failed:`);
    for (const f of failures) {
      console.log(`  ${f.id}  ${f.decision.padEnd(11)} top1=${f.top1Score.toFixed(3)}  ${f.question.slice(0, 56)}`);
    }
  }

  // Leakage is the number that maps directly to "does it lie to students". Fail the command on it
  // so this can gate CI later without anyone having to remember to read the output.
  if (summary.falseAcceptanceRate > 0) {
    console.log('\nFAIL: off-syllabus questions were answered. Raise PASS_TOP1 and re-run.');
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('\nEvaluation failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
