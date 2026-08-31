'use client';

import { useEffect, useState } from 'react';

// Subject code -> the CSS custom property suffix used in globals.css's --color-subj-* block.
// Most match the subject code directly; mathematics and computer_science use shorter suffixes
// there (an existing naming choice, not something introduced here).
const SUBJECT_COLOR_VAR_SUFFIX: Record<string, string> = {
  physics: 'physics',
  chemistry: 'chemistry',
  biology: 'biology',
  mathematics: 'maths',
  english: 'english',
  urdu: 'urdu',
  computer_science: 'cs',
  islamiyat: 'islamiyat',
  pakistan_studies: 'pakstudies',
};

// --color-brand, as a literal — used only until the real CSS custom property resolves on
// mount, and as a last-resort fallback for a subject code with no mapped color var.
const FALLBACK_COLOR = '#237A57';

/** Resolves a subject's --color-subj-* custom property to a real hex string, once, client-side.
 *  Read once per mount rather than reactively watching data-theme changes — none of the
 *  --color-subj-* tokens have dark-mode overrides today (confirmed in globals.css: the other
 *  7 subject colors are reused as-is in dark mode), so a live theme toggle while on /explore
 *  wouldn't change the value anyway. Not worth a MutationObserver for that non-case. */
export function useSubjectColor(subjectCode: string): string {
  const [color, setColor] = useState(FALLBACK_COLOR);

  useEffect(() => {
    const suffix = SUBJECT_COLOR_VAR_SUFFIX[subjectCode];
    if (!suffix) return;
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-subj-${suffix}`)
      .trim();
    if (value) setColor(value);
  }, [subjectCode]);

  return color;
}
