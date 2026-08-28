'use client';

import React from 'react';

interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon: React.ComponentType<{ className?: string }>;
  trailing?: React.ReactNode;
}

export default function AuthField({ icon: Icon, trailing, className = '', ...inputProps }: AuthFieldProps) {
  return (
    <div className="relative group">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-3 group-focus-within:text-brand transition-colors pointer-events-none" />
      <input
        {...inputProps}
        className={`w-full rounded-2xl border border-border bg-surface-2/60 ${trailing ? 'pr-12' : 'pr-4'} pl-12 py-3.5 text-[15px] text-navy placeholder:text-text-3 focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition-all duration-300 ${className}`}
      />
      {trailing && <div className="absolute right-4 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}
