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

export type SubjectCode = (typeof SUBJECTS)[number]['code'];

export const SUBJECT_LABELS: Record<string, string> = Object.fromEntries(
  SUBJECTS.map((s) => [s.code, s.label])
);

// FBISE splits Islamiyat and Pakistan Studies across the two HSSC years instead of teaching
// both every year: Islamiyat is examined in HSSC-I (Class 11) only, Pakistan Studies in
// HSSC-II (Class 12) only. Both stay compulsory across the two SSC years (Class 9-10), so this
// exclusion is deliberately scoped to 11/12 only.
const HSSC_EXCLUDED_SUBJECT: Partial<Record<number, SubjectCode>> = {
  11: 'pakistan_studies',
  12: 'islamiyat',
};

export function isSubjectOfferedForClass(subjectCode: string, classLevel: number | null | undefined): boolean {
  if (classLevel == null) return true;
  return HSSC_EXCLUDED_SUBJECT[classLevel] !== subjectCode;
}

export function subjectsForClassLevel<T extends string>(
  subjects: readonly T[],
  classLevel: number | null | undefined
): T[] {
  return subjects.filter((s) => isSubjectOfferedForClass(s, classLevel));
}
