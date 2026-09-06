import React from 'react';

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  /** Which of the app's existing feature accents this stat belongs to — 'brand' (default),
   *  'ai' (Doubts/Chat), or 'quiz'. A row of identical green icon chips reads as one templated
   *  stat repeated twice; borrowing each feature's own color ties the number back to where it
   *  came from instead. */
  tone?: 'brand' | 'ai' | 'quiz';
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  brand: 'bg-accent-subtle text-brand',
  ai: 'bg-ai-light text-ai',
  quiz: 'bg-quiz-light text-quiz',
};

// The number is the focal point even when it's "—" — an empty stat should read as "nothing
// recorded yet," never as a broken widget. Strong text-navy value + a real hint sentence does
// that; a dim placeholder number does not. See docs brief §10.
export default function StatCard({ icon: Icon, label, value, hint, tone = 'brand' }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text-2">{label}</span>
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="font-display text-3xl font-semibold text-navy leading-none">{value}</div>
      {hint && <p className="text-[11px] text-text-2 mt-2 leading-relaxed">{hint}</p>}
    </div>
  );
}
