// THE labelled evaluation set. Single source of truth.
//
// Both /api/eval and scripts/eval.ts import from here. There is deliberately no second copy —
// this set previously existed in three places with different questions AND different field names,
// which meant the dashboard and the CLI reported different numbers for the same system.
//
// Label these BY HAND against the actual textbook. Do not have an AI generate them: an
// AI-labelled set measures whether two models agree, not whether this system is correct, and a
// judge who asks "who wrote your ground truth?" will find that out in one question.
//
// See docs/evaluation.md for what the metrics mean and how to calibrate against them.

export type EvalLabel = 'in_syllabus' | 'out_of_syllabus';

export interface EvalQuestion {
  id: string;
  lang: 'en' | 'ur' | 'roman_ur';
  label: EvalLabel;
  subject: string;
  question: string;
  /** Chapters that should be retrieved. Empty for out_of_syllabus. */
  expectedChapter: number[];
  /** Why this is off-syllabus, or why it's a hard case. Shown in the report. */
  reason?: string;
  /**
   * Off-syllabus questions that are TOPICALLY CLOSE to the syllabus — same subject, wrong class,
   * or right chapter but beyond the book's depth. These are the cases that actually test the
   * guardrail; a chemistry question against a physics bot proves very little. Reported separately
   * so the hard number isn't averaged away by easy wins.
   */
  nearMiss?: boolean;
}

export const EVAL_QUESTIONS: EvalQuestion[] = [
  // ---- In-syllabus ----
  {
    id: 'is-001',
    lang: 'en',
    label: 'in_syllabus',
    subject: 'physics',
    question: "What is Ohm's law?",
    expectedChapter: [14],
  },
  {
    id: 'is-002',
    lang: 'roman_ur',
    label: 'in_syllabus',
    subject: 'physics',
    question: 'Ohm ka qanoon kya hai aur resistance ki tareef karein?',
    expectedChapter: [14],
  },
  {
    id: 'is-003',
    lang: 'en',
    label: 'in_syllabus',
    subject: 'physics',
    question: "State Joule's law of heating and write its formula.",
    expectedChapter: [14],
  },
  {
    id: 'is-004',
    lang: 'en',
    label: 'in_syllabus',
    subject: 'physics',
    question: "Explain electromagnetic induction and Faraday's law.",
    expectedChapter: [15],
  },
  {
    id: 'is-005',
    lang: 'roman_ur',
    label: 'in_syllabus',
    subject: 'physics',
    question: 'Transformer direct current (DC) par kyun kaam nahi karta?',
    expectedChapter: [15],
  },
  {
    id: 'is-006',
    lang: 'en',
    label: 'in_syllabus',
    subject: 'physics',
    question: 'Define half-life of a radioactive isotope.',
    expectedChapter: [18],
  },

  // ---- Off-syllabus: clearly distant. Easy wins, and the clean demo moment. ----
  {
    id: 'oos-001',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: 'Explain the mechanism of an organic SN2 reaction.',
    expectedChapter: [],
    reason: 'Chemistry topic, different subject',
  },
  {
    id: 'oos-002',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: 'What is the time complexity of the quicksort algorithm in computer science?',
    expectedChapter: [],
    reason: 'Computer science, not Matric Physics',
  },
  {
    id: 'oos-003',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: 'How do human kidneys perform ultrafiltration?',
    expectedChapter: [],
    reason: 'Biology topic, not Matric Physics',
  },
  {
    id: 'oos-004',
    lang: 'roman_ur',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: 'Photosynthesis ka dark reaction kahan hota hai?',
    expectedChapter: [],
    reason: 'Botany/Biology, asked in Roman Urdu',
  },
  {
    id: 'oos-005',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: 'Calculate stock option pricing using the Black-Scholes formula.',
    expectedChapter: [],
    reason: 'Financial mathematics, off-syllabus',
  },

  // ---- Off-syllabus: NEAR-MISS. Same subject, wrong syllabus. The cases that actually matter. ----
  // If these refuse reliably, you have a guardrail. If only the block above refuses, you have a
  // keyword filter. Report this group's number separately — it is the defensible claim.
  {
    id: 'nm-001',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: 'Derive the three equations of motion for uniform acceleration.',
    expectedChapter: [],
    reason: 'Class 9 Physics — same subject, earlier syllabus',
    nearMiss: true,
  },
  {
    id: 'nm-002',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: "Explain Maxwell's equations and how they unify electricity and magnetism.",
    expectedChapter: [],
    reason: 'Class 11/12 — topically adjacent to Chapter 15, beyond Class 10',
    nearMiss: true,
  },
  {
    id: 'nm-003',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: "Derive Ohm's law from the Drude model of electron conduction.",
    expectedChapter: [],
    reason: 'Correct chapter topic, far beyond the textbook depth',
    nearMiss: true,
  },
  {
    id: 'nm-004',
    lang: 'roman_ur',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: 'Newton ka gravitation ka qanoon aur uska formula kya hai?',
    expectedChapter: [],
    reason: 'Class 9 Physics in Roman Urdu — same subject, earlier syllabus',
    nearMiss: true,
  },
];
