import { NextRequest, NextResponse } from 'next/server';
import { INITIAL_SYLLABUS_CHUNKS } from '@/lib/syllabus-data';
import { getGeminiClient } from '@/lib/gemini';

export interface QuizQuestionData {
  id: string;
  position: number;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  chunkId: string;
  chapterNo: number;
  page: number;
  section: string;
}

const PRECOMPUTED_QUIZZES: Record<number, QuizQuestionData[]> = {
  14: [
    {
      id: 'q-14-1',
      position: 1,
      stem: "What is the SI unit of electric current?",
      options: ["Volt (V)", "Ampere (A)", "Ohm (Ω)", "Coulomb (C)"],
      correctIndex: 1,
      explanation: "Current is the rate of flow of charge (I = Q/t). Its SI unit is Ampere (A), which equals 1 Coulomb per second.",
      chunkId: 'pctb-10-phy-ch14-01',
      chapterNo: 14,
      page: 91,
      section: '14.1 Electric Current'
    },
    {
      id: 'q-14-2',
      position: 2,
      stem: "According to Ohm's law, what condition must remain constant for current to be directly proportional to potential difference?",
      options: ["The magnetic field", "The temperature and physical state", "The color of the wire", "The atmospheric pressure"],
      correctIndex: 1,
      explanation: "Ohm's law states that V ∝ I only when the temperature and physical state of the conductor remain constant.",
      chunkId: 'pctb-10-phy-ch14-03',
      chapterNo: 14,
      page: 95,
      section: "14.3 Ohm's Law and Resistance"
    },
    {
      id: 'q-14-3',
      position: 3,
      stem: "How is the resistance of a conductor related to its cross-sectional area (A)?",
      options: ["Directly proportional (R ∝ A)", "Inversely proportional (R ∝ 1/A)", "Independent of area", "Proportional to A squared"],
      correctIndex: 1,
      explanation: "Resistance is inversely proportional to cross-sectional area: R = ρ(L/A). Thicker wires offer less resistance.",
      chunkId: 'pctb-10-phy-ch14-04',
      chapterNo: 14,
      page: 98,
      section: '14.4 Factors Affecting Resistance'
    },
    {
      id: 'q-14-4',
      position: 4,
      stem: "According to Joule's Law, how is heat generated in a resistor related to the current flowing through it?",
      options: ["Proportional to current (I)", "Proportional to square of current (I²)", "Inversely proportional to current", "Proportional to square root of current"],
      correctIndex: 1,
      explanation: "Joule's law states that heat generated W = I² · R · t, directly proportional to the square of current.",
      chunkId: 'pctb-10-phy-ch14-05',
      chapterNo: 14,
      page: 102,
      section: "14.6 Joule's Law"
    },
    {
      id: 'q-14-5',
      position: 5,
      stem: "One kilowatt-hour (1 kWh) of electrical energy is equal to how many Joules?",
      options: ["1,000 J", "36,000 J", "3.6 × 10⁶ J (3.6 MJ)", "3.6 × 10³ J"],
      correctIndex: 2,
      explanation: "1 kWh = 1000 W × 3600 seconds = 3,600,000 J = 3.6 × 10⁶ Joules.",
      chunkId: 'pctb-10-phy-ch14-05',
      chapterNo: 14,
      page: 103,
      section: "14.6 Joule's Law and Electrical Energy"
    }
  ],
  15: [
    {
      id: 'q-15-1',
      position: 1,
      stem: "Which rule is used to find the direction of magnetic field lines around a straight current-carrying wire?",
      options: ["Left Hand Rule", "Right Hand Grip Rule", "Lenz's Rule", "Coulomb's Law"],
      correctIndex: 1,
      explanation: "Grasp the wire with thumb pointing in direction of conventional current; curled fingers point along magnetic field lines.",
      chunkId: 'pctb-10-phy-ch15-01',
      chapterNo: 15,
      page: 116,
      section: '15.1 Magnetic Effects of Steady Current'
    },
    {
      id: 'q-15-2',
      position: 2,
      stem: "Lenz's Law is a consequence of which fundamental law of physics?",
      options: ["Conservation of charge", "Conservation of energy", "Conservation of momentum", "Newton's third law"],
      correctIndex: 1,
      explanation: "Lenz's Law states induced current opposes its cause, which complies strictly with the Law of Conservation of Energy.",
      chunkId: 'pctb-10-phy-ch15-02',
      chapterNo: 15,
      page: 124,
      section: '15.4 Electromagnetic Induction & Lenz’s Law'
    },
    {
      id: 'q-15-3',
      position: 3,
      stem: "Why does a transformer NOT operate on direct current (DC)?",
      options: ["DC has too high voltage", "DC does not produce a changing magnetic flux", "DC burns the copper wire", "DC has infinite frequency"],
      correctIndex: 1,
      explanation: "Transformers require changing magnetic flux to induce voltage in the secondary coil; steady DC has zero rate of flux change.",
      chunkId: 'pctb-10-phy-ch15-03',
      chapterNo: 15,
      page: 129,
      section: '15.6 Transformer'
    }
  ]
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const chapterNo = Number(body.chapterNo || 14);
    const subject = body.subject || 'physics';

    const matchingChunks = INITIAL_SYLLABUS_CHUNKS.filter(
      (c) => c.chapterNo === chapterNo && c.subject.toLowerCase() === subject.toLowerCase()
    );

    if (matchingChunks.length === 0) {
      return NextResponse.json(
        { error: 'Chapter not found in syllabus database.' },
        { status: 404 }
      );
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const chunkText = matchingChunks
          .map((c) => `[CHUNK id="${c.id}" page="${c.pageFrom}" section="${c.section}"]\n${c.content}\n[/CHUNK]`)
          .join('\n\n');

        const prompt = `Based ONLY on the syllabus chunks below, generate 5 multiple choice questions (MCQs) for Pakistani Board Class 10 Physics Chapter ${chapterNo}.
Each MCQ must have exactly 4 options, a 0-indexed correct answer, a brief explanation citing the textbook fact, and the chunkId it was derived from.

CONTEXT:
${chunkText}

Return strictly a JSON array of objects in this shape:
[
  {
    "id": "q-1",
    "position": 1,
    "stem": "Question text here?",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0,
    "explanation": "Why this is correct according to the syllabus...",
    "chunkId": "pctb-10-phy-ch14-01"
  }
]`;

        const res = await ai.models.generateContent({
          model: process.env.CHAT_MODEL || 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });

        const text = res.text?.trim();
        if (text) {
          const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const mappedQuestions: QuizQuestionData[] = parsed.map((q, idx) => {
              const matchedChunk = matchingChunks.find(c => c.id === q.chunkId) || matchingChunks[0];
              return {
                id: q.id || `gen-q-${idx}`,
                position: idx + 1,
                stem: q.stem,
                options: q.options,
                correctIndex: q.correctIndex,
                explanation: q.explanation,
                chunkId: matchedChunk.id,
                chapterNo: matchedChunk.chapterNo,
                page: matchedChunk.pageFrom,
                section: matchedChunk.section
              };
            });
            return NextResponse.json({ questions: mappedQuestions, chapterNo, subject });
          }
        }
      } catch (err) {
        console.warn('Gemini quiz generation fallback:', err);
      }
    }

    const fallbackQuestions = PRECOMPUTED_QUIZZES[chapterNo] || PRECOMPUTED_QUIZZES[14];
    return NextResponse.json({
      questions: fallbackQuestions,
      chapterNo,
      subject,
      note: 'Verified syllabus questions from PCTB Class 10'
    });
  } catch (error) {
    console.error('Quiz API error:', error);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
