import type { WrittenReview } from '@/lib/quiz/grading';

export default function WrittenAnswerReview({
  gradingState, review, feedback, pointsPossible,
}: {
  gradingState: 'graded' | 'unavailable';
  review: WrittenReview | null;
  feedback: string | null;
  pointsPossible: number | null;
}) {
  if (gradingState === 'unavailable' || !review) {
    return <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs text-navy-2">
      Grading unavailable. {feedback || 'This answer has not been marked.'}
    </div>;
  }
  return <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs space-y-3">
    <div className="flex flex-wrap justify-between gap-2 font-semibold text-brand">
      <span>Written answer review</span>
      <span className="font-mono text-navy">{review.totalAwarded} / {pointsPossible ?? review.totalPossible} marks · {review.totalDeducted} deducted</span>
    </div>
    <div>
      <p className="font-semibold text-navy">Textbook answer passages</p>
      <p className="text-navy-2 whitespace-pre-wrap mt-1">{review.correctAnswer}</p>
    </div>
    <ol className="space-y-3">
      {review.criteria.map((criterion) => <li key={criterion.criterionId} className="border-t border-border pt-3 space-y-1">
        <div className="flex flex-wrap justify-between gap-2 font-semibold text-navy">
          <span>{criterion.expectation}</span>
          <span className="font-mono">{criterion.awarded} / {criterion.possible} · −{criterion.deducted}</span>
        </div>
        <p className="text-navy-2">{criterion.reason}</p>
        <div className="border-l-2 border-brand pl-2 text-text-2">
          <p className="font-semibold">Textbook · Ch {criterion.source.chapterNo}{criterion.source.chapterTitle ? ` ${criterion.source.chapterTitle}` : ''}{criterion.source.section ? ` · ${criterion.source.section}` : ''}{criterion.source.pageFrom ? ` · p. ${criterion.source.pageFrom}${criterion.source.pageTo && criterion.source.pageTo !== criterion.source.pageFrom ? `–${criterion.source.pageTo}` : ''}` : ''}</p>
          <p className="mt-1 whitespace-pre-wrap">“{criterion.source.excerpt}”</p>
        </div>
      </li>)}
    </ol>
  </div>;
}
