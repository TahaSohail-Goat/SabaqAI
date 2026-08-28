import React from 'react';

export default function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-navy">{title}</h2>
      {subtitle && <p className="text-xs text-text-2 mt-0.5">{subtitle}</p>}
    </div>
  );
}
