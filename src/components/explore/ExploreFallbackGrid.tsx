'use client';

import { BookOpen } from 'lucide-react';
import { SUBJECT_LABELS } from '@/lib/subjects';
import type { ExploreSubjectSummary } from '@/lib/types';
import { useSubjectColor } from '@/lib/explore/subjectVisuals';

interface ExploreFallbackGridProps {
  enrolledSubjects: string[];
  overviewBySubject: Map<string, ExploreSubjectSummary>;
  onArrived: (code: string) => void;
}

// No-WebGL safety net — a rare but real case. Reuses this app's existing card idiom rather than
// building a second, lighter 3D-alternative implementation to maintain.
export default function ExploreFallbackGrid({ enrolledSubjects, overviewBySubject, onArrived }: ExploreFallbackGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
      {enrolledSubjects.map((code) => (
        <SubjectCard
          key={code}
          code={code}
          hasTextbook={overviewBySubject.get(code)?.hasTextbook ?? false}
          onArrived={onArrived}
        />
      ))}
    </div>
  );
}

function SubjectCard({ code, hasTextbook, onArrived }: { code: string; hasTextbook: boolean; onArrived: (code: string) => void }) {
  const color = useSubjectColor(code);

  return (
    <button
      type="button"
      onClick={() => onArrived(code)}
      className="text-left bg-surface border border-border rounded-2xl p-5 hover:border-brand/40 hover:shadow-sm transition-all"
      style={{ borderTopWidth: 3, borderTopColor: color }}
    >
      <div className="flex items-center gap-2.5">
        <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color }} />
        <span className="text-sm font-bold text-navy">{SUBJECT_LABELS[code] ?? code}</span>
      </div>
      <p className="mt-1.5 text-xs text-text-2">
        {hasTextbook ? 'Real textbook chapters available' : 'Model papers available'}
      </p>
    </button>
  );
}
