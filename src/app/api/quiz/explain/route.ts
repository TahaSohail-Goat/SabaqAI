import { createQuizExplainHandler } from '@/lib/quiz/explain-http';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const POST = createQuizExplainHandler();
