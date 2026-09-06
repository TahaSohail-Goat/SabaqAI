import { BookOpen, FileText, FileCheck2, type LucideIcon } from 'lucide-react';
import type { AskSourceType } from '@/lib/types';

export const ASK_SOURCE_TYPES: AskSourceType[] = ['textbook', 'past_paper', 'model_paper'];

export const ASK_SOURCE_META: Record<
  AskSourceType,
  { label: string; unitNoun: string; description: string; icon: LucideIcon }
> = {
  textbook: {
    label: 'Books',
    unitNoun: 'Chapter',
    description: 'Ask from one chapter of your textbook',
    icon: BookOpen,
  },
  past_paper: {
    label: 'Past Papers',
    unitNoun: 'Paper',
    description: 'Ask from one past board exam paper',
    icon: FileText,
  },
  model_paper: {
    label: 'Model Papers',
    unitNoun: 'Paper',
    description: 'Ask from one official model/assessment paper',
    icon: FileCheck2,
  },
};
