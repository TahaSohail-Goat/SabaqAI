import { teachingSchema, reviewSchema, type SupportReview } from './contracts';
import type { EvidenceChunk, TeachingAnswer } from '../types';
import { validateCitations } from '../ai/citation';
import { protectedSpans } from './preservation';

export function checkTeaching(value: unknown, evidence: EvidenceChunk[], language: string, question = ''): { answer: TeachingAnswer; failures: string[] } {
  const answer = teachingSchema.parse(value);
  const failures: string[] = [];
  const known = new Map(evidence.map((c) => [c.id, c]));
  if (answer.language !== language) failures.push('Wrong answer language.');
  if (!answer.answerable) return { answer, failures: answer.statements.length || answer.blocks.length || answer.coverage !== 'insufficient' ? ['Unanswerable output contains claims.'] : failures };
  if (!answer.statements.length || !answer.blocks.length || answer.coverage === 'insufficient') failures.push('No coherent answer.');
  if (answer.coverage === 'partial' && !answer.missingAspects.length) failures.push('Partial coverage has no limitation.');
  if (answer.coverage === 'sufficient' && answer.missingAspects.length) failures.push('Coverage contradicts limitations.');
  const ids = answer.statements.map((s) => s.id);
  if (new Set(ids).size !== ids.length) failures.push('Duplicate statement IDs.');
  const references = answer.blocks.flatMap((b) => b.statementIds);
  if (references.length !== ids.length || new Set(references).size !== ids.length || references.some((id) => !ids.includes(id))) failures.push('Blocks do not match canonical statements.');
  if (answer.blocks[0]?.kind !== 'direct_answer') failures.push('Missing direct answer.');
  for (const statement of answer.statements) {
    // Reject the complete explanation rather than letting removal of an unknown premise
    // leave a misleading chain of prose. Invalid IDs are never replaced or reassigned.
    if (statement.chunkIds.some((id) => !known.has(id)) || new Set(statement.chunkIds).size !== statement.chunkIds.length) failures.push(`Invalid citation on ${statement.id}.`);
    if (/<\/?[a-z][^>]*>/i.test(statement.text) || /https?:\/\//i.test(statement.text)) failures.push(`Untrusted markup or URL on ${statement.id}.`);
  }
  if (answer.statements.filter((s) => s.kind === 'illustration').length > 1) failures.push('More than one original illustration.');
  for (const block of answer.blocks) {
    const members = answer.statements.filter((s) => block.statementIds.includes(s.id));
    if (block.kind === 'example' && members.some((s) => s.kind !== 'book_example' && s.kind !== 'illustration')) failures.push('Example block has an invalid kind.');
  }
  const numericIllustrations = answer.statements.filter((s) => s.kind === 'illustration' && /\d/.test(s.text));
  if (numericIllustrations.some((s) => answer.calculation?.statementId !== s.id)) failures.push('Numerical illustration has no checked calculation.');
  for (const statement of answer.statements) {
    if (/=\s*[+-]?(?:\d|\.\d)/.test(statement.text) && answer.calculation?.statementId !== statement.id) {
      const cited = statement.chunkIds.map((id) => known.get(id)?.content ?? '').join(' ');
      const sourceNumbers = protectedSpans(cited);
      if (protectedSpans(statement.text).some((s) => s.startsWith('quantity:') && !sourceNumbers.includes(s))) failures.push('Computed result has no checked calculation.');
    }
  }
  if (answer.calculation) {
    const c = answer.calculation, statement = answer.statements.find((s) => s.id === c.statementId);
    const formula = known.get(c.formulaChunkId);
    const [a, b] = c.inputs;
    const rules = {
      'V=I*R': { units: ['A', 'ohm'], out: 'V', result: a.value * b.value, source: /V\s*=\s*I\s*(?:[×*·]\s*)?R/i },
      'R=V/I': { units: ['V', 'A'], out: 'ohm', result: a.value / b.value, source: /(?:R\s*=\s*V\s*\/\s*I|V\s*=\s*I\s*(?:[×*·]\s*)?R)/i },
      'I=V/R': { units: ['V', 'ohm'], out: 'A', result: a.value / b.value, source: /(?:I\s*=\s*V\s*\/\s*R|V\s*=\s*I\s*(?:[×*·]\s*)?R)/i },
    }[c.formula];
    if (!statement || !formula || !statement.chunkIds.includes(formula.id) || !rules.source.test(formula.content)
      || a.unit !== rules.units[0] || b.unit !== rules.units[1] || c.unit !== rules.out
      || !Number.isFinite(rules.result) || Math.abs(rules.result - c.result) > 1e-9 * Math.max(1, Math.abs(c.result))) failures.push('Calculation formula, units or arithmetic failed.');
    if (statement?.kind === 'illustration' && (c.inputs.some((i) => i.origin !== 'assumed') || !/(assum|suppos|فرض)/i.test(statement.text))) failures.push('Illustration assumptions are not labeled.');
    for (const input of c.inputs) {
      const sourceText = input.origin === 'student' ? question : input.origin === 'book' ? formula?.content ?? '' : statement?.kind === 'illustration' ? String(input.value) : '';
      if (input.origin !== 'assumed' && !protectedSpans(sourceText).includes(`quantity:${input.value}:${input.unit.toLowerCase()}`)) failures.push('Calculation input has no declared quantity/unit origin.');
    }
    if (statement && !protectedSpans(statement.text).includes(`quantity:${c.result}:${c.unit.toLowerCase()}`)) failures.push('Visible calculation does not contain its checked result/unit.');
  }
  return { answer, failures };
}

export function checkReview(value: unknown, answer: TeachingAnswer): SupportReview {
  const review = reviewSchema.parse(value);
  const expected = new Map(answer.statements.map((s) => [s.id, s]));
  if (review.verdicts.length !== expected.size || new Set(review.verdicts.map((v) => v.statementId)).size !== expected.size) throw new Error('Reviewer statement set mismatch.');
  for (const verdict of review.verdicts) {
    const statement = expected.get(verdict.statementId);
    if (!statement || verdict.chunkIds.some((id) => !statement.chunkIds.includes(id)) || new Set(verdict.chunkIds).size !== verdict.chunkIds.length) throw new Error('Reviewer invented source identity.');
  }
  return review;
}

export function citationsFor(answer: TeachingAnswer, evidence: EvidenceChunk[]) {
  return validateCitations(answer, evidence.map((c) => ({ ...c, score: c.score ?? 0 })));
}
