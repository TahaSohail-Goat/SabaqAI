'use client';

import React from 'react';

interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon: React.ComponentType<{ className?: string }>;
  trailing?: React.ReactNode;
  /** Switches the border/ring to the error palette. A plain className append can't
   *  reliably do this — border-error and border-border have equal CSS specificity,
   *  so whichever wins depends on generated stylesheet order, not JSX order. */
  error?: boolean;
}

export default function AuthField({ icon: Icon, trailing, error = false, className = '', ...inputProps }: AuthFieldProps) {
  return (
    <div className="relative group">
      <Icon
        className={`absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] transition-colors pointer-events-none ${
          error ? 'text-error' : 'text-text-3 group-focus-within:text-brand'
        }`}
      />
      <input
        {...inputProps}
        className={`w-full rounded-2xl border bg-surface-2/60 ${trailing ? 'pr-12' : 'pr-4'} pl-12 py-3.5 text-[15px] text-navy placeholder:text-text-3 focus:bg-surface focus:outline-none transition-all duration-300 ${
          error
            ? 'border-error focus:border-error focus:ring-2 focus:ring-error/20'
            : 'border-border focus:border-brand focus:ring-2 focus:ring-brand/20'
        } ${className}`}
      />
      {trailing && <div className="absolute right-4 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}
