import React from 'react';
import { BookOpen, Award, RefreshCw } from 'lucide-react';

type PlanAction = 'study' | 'quiz' | 'review';

// Reuses icon associations already established elsewhere in this app (Award = Quiz, in the
// sidebar nav) rather than inventing a new color language for actions — identity comes from the
// icon shape + label, same "never color alone" rule the mastery badges follow.
const ACTION_CONFIG: Record<PlanAction, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  study: { label: 'Study', icon: BookOpen, className: 'bg-info-bg text-info' },
  quiz: { label: 'Quiz', icon: Award, className: 'bg-brand-light text-brand-dark' },
  review: { label: 'Review', icon: RefreshCw, className: 'bg-surface-2 text-text-2 border border-border' },
};

export default function ActionBadge({ action, className = '' }: { action: PlanAction; className?: string }) {
  const { label, icon: Icon, className: actionClassName } = ACTION_CONFIG[action];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${actionClassName} ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
