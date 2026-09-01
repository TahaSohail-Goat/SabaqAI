import React from 'react';
import { ChevronDown } from 'lucide-react';

// Native <select> arrows sit flush against the browser's own padding, not this app's — on a
// rounded pill control that reads as touching the border. appearance-none removes the native
// arrow so a Lucide chevron can be positioned with real spacing (right-3) and predictable
// padding (pr-8) on the select itself, so text never runs under it either.
export default function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  className = '',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-bold text-text-2 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg text-xs font-semibold bg-surface-2 border border-border-strong text-navy-2 focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-2" />
      </div>
    </div>
  );
}
