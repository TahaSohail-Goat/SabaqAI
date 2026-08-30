// Single source of truth for the 9 subjects seeded in `subjects` (0001_init.sql +
// 0009_missing_subjects.sql) and covered by the FBISE crawler (data/crawl-sources.json).
// Used by signup auto-enrollment, onboarding, settings, and the quiz/syllabus subject filters —
// previously duplicated across all of those and drifting (6 subjects listed vs. 9 actually
// ingested). Keep this list and the `subjects` table in sync.

export const SUBJECTS = [
  { code: 'physics', label: 'Physics' },
  { code: 'chemistry', label: 'Chemistry' },
  { code: 'biology', label: 'Biology' },
  { code: 'mathematics', label: 'Mathematics' },
  { code: 'english', label: 'English' },
  { code: 'urdu', label: 'Urdu' },
  { code: 'computer_science', label: 'Computer Science' },
  { code: 'islamiyat', label: 'Islamiyat' },
  { code: 'pakistan_studies', label: 'Pakistan Studies' },
] as const;

export const ALL_SUBJECT_CODES: string[] = SUBJECTS.map((s) => s.code);

export const SUBJECT_LABELS: Record<string, string> = Object.fromEntries(
  SUBJECTS.map((s) => [s.code, s.label])
);
