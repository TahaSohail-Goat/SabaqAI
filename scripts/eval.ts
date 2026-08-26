// Day 6. Run data/evaluation/questions.jsonl through retrieval + guardrail
import { retrieve } from '../src/lib/ai/retrieval';
import { evaluateConfidence } from '../src/lib/ai/guardrail';
import fs from 'fs';
import path from 'path';

async function runEval() {
  console.log('====================================================');
  console.log('  SABAQ AI — DAY 6 EVALUATION & CALIBRATION BENCHMARK');
  console.log('====================================================\n');

  const questionsFile = path.join(process.cwd(), 'data/evaluation/questions.jsonl');
  let rawQuestions: any[] = [];
  
  if (fs.existsSync(questionsFile)) {
    const lines = fs.readFileSync(questionsFile, 'utf8').split('\n').filter(l => l.trim());
    rawQuestions = lines.map(l => JSON.parse(l));
  } else {
    rawQuestions = [
      { id: 'is-001', lang: 'en', label: 'in_syllabus', subject: 'physics', question: "What is Ohm's law?", expected_chapter: [14] },
      { id: 'is-002', lang: 'roman_ur', label: 'in_syllabus', subject: 'physics', question: "Ohm ka qanoon kya hai?", expected_chapter: [14] },
      { id: 'oos-001', lang: 'en', label: 'out_of_syllabus', subject: 'physics', question: "Explain the mechanism of an organic SN2 reaction.", expected_chapter: [], reason: "chemistry" },
      { id: 'oos-002', lang: 'en', label: 'out_of_syllabus', subject: 'physics', question: "What is the time complexity of quicksort?", expected_chapter: [], reason: "computer science" }
    ];
  }

  let inCount = 0;
  let inHits = 0;
  let falseRefusal = 0;
  let outCount = 0;
  let trueRefusal = 0;
  let falseAcceptance = 0;

  console.log('Evaluating queries against PCTB Matric Physics corpus:\n');
  console.log(
    'ID'.padEnd(10) +
    'Type'.padEnd(16) +
    'Top1'.padEnd(8) +
    'Supp'.padEnd(6) +
    'Decision'.padEnd(12) +
    'Status'.padEnd(8) +
    'Question'
  );
  console.log('-'.repeat(85));

  for (const q of rawQuestions) {
    const chunks = await retrieve({
      normalisedQuery: q.question,
      board: 'PCTB',
      classLevel: 10,
      subject: q.subject || 'physics',
    });

    const guardrail = evaluateConfidence(chunks);
    const expected = q.expected_chapter || [];
    const retrievedChapters = Array.from(new Set(chunks.map(c => c.chapterNo)));

    let status = 'PASS';
    if (q.label === 'in_syllabus') {
      inCount++;
      const hit = expected.some((ch: number) => retrievedChapters.includes(ch));
      if (hit) inHits++;
      if (guardrail.decision === 'REFUSE') {
        falseRefusal++;
        status = 'FAIL (Refused)';
      }
    } else {
      outCount++;
      if (guardrail.decision === 'REFUSE') {
        trueRefusal++;
        status = 'OK (Refused)';
      } else {
        falseAcceptance++;
        status = 'FAIL (Leaked)';
      }
    }

    console.log(
      q.id.padEnd(10) +
      q.label.padEnd(16) +
      guardrail.top1.toFixed(2).padEnd(8) +
      String(guardrail.support).padEnd(6) +
      guardrail.decision.padEnd(12) +
      status.padEnd(8) +
      q.question.slice(0, 30)
    );
  }

  console.log('\n================== BENCHMARK SUMMARY ==================');
  console.log(`Retrieval Accuracy (In-Syllabus): ${((inHits / inCount) * 100).toFixed(1)}%`);
  console.log(`Refusal Rate (Off-Syllabus):      ${((trueRefusal / outCount) * 100).toFixed(1)}%`);
  console.log(`False Acceptance Rate (Leakage):  ${((falseAcceptance / outCount) * 100).toFixed(1)}%`);
  console.log(`False Refusal Rate:               ${((falseRefusal / inCount) * 100).toFixed(1)}%`);
  console.log('=======================================================\n');
}

runEval().catch(console.error);
