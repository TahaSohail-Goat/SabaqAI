import React from 'react';
import { Check } from 'lucide-react';

interface Criterion {
  label: string;
  test: (pw: string) => boolean;
}

const CRITERIA: Criterion[] = [
  { label: 'At least 6 characters', test: (pw) => pw.length >= 6 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
];

type Tier = 'empty' | 'weak' | 'good' | 'strong';

function tierFor(metCount: number, total: number): Tier {
  if (metCount === 0) return 'empty';
  if (metCount === total) return 'strong';
  if (metCount >= Math.ceil(total / 2)) return 'good';
  return 'weak';
}

const TIER_META: Record<Exclude<Tier, 'empty'>, { label: string; barClass: string; textClass: string; segments: number }> = {
  weak: { label: 'Weak password', barClass: 'bg-error', textClass: 'text-error', segments: 1 },
  good: { label: 'Good password', barClass: 'bg-warning', textClass: 'text-warning', segments: 2 },
  strong: { label: 'Strong password', barClass: 'bg-success', textClass: 'text-success', segments: 3 },
};

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const metCount = CRITERIA.filter((c) => c.test(password)).length;
  const tier = tierFor(metCount, CRITERIA.length);

  return (
    <div className="mt-2.5">
      {/* Horizontal segmented strength bar */}
      <div className="flex gap-1.5" role="img" aria-label={tier === 'empty' ? 'Password strength not yet rated' : TIER_META[tier].label}>
        {[0, 1, 2].map((i) => {
          const filled = tier !== 'empty' && i < TIER_META[tier].segments;
          return (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                filled ? TIER_META[tier].barClass : 'bg-border'
              }`}
            />
          );
        })}
      </div>

      {tier !== 'empty' && (
        <p className={`mt-1.5 text-[12px] font-semibold ${TIER_META[tier].textClass}`}>
          {TIER_META[tier].label}
        </p>
      )}

      {/* Criteria checklist */}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {CRITERIA.map((c) => {
          const met = c.test(password);
          return (
            <div key={c.label} className="flex items-center gap-1.5">
              <span
                className={`flex items-center justify-center w-3.5 h-3.5 rounded-full border transition-colors duration-200 ${
                  met ? 'bg-success border-success' : 'border-border-strong'
                }`}
              >
                {met && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </span>
              <span className={`text-[11px] transition-colors duration-200 ${met ? 'text-navy-2' : 'text-text-3'}`}>
                {c.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
