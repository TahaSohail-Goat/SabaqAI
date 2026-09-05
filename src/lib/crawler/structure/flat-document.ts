// Model papers / past papers / marking schemes are typically a single "document" — not
// structured into chapters. Treats the whole paper as one chapter (chapterNo = its year, or
// a running counter when no year is known) and splits it into sections at blank-line
// boundaries. Ported from the old crawler's textToSourceDocument — behavior unchanged.

import type { SourceDocument } from '../../ingest/chunker';
import type { AskSourceType, CrawlerLanguage } from '../types';
import { MAX_SECTION_CHARS } from '../types';

export interface FlatDocumentSource {
  board: string;
  classLevel: number;
  subject: string;
  sourceType: Exclude<AskSourceType, 'textbook'>;
  language: CrawlerLanguage;
  year: number | null;
}

export function textToSourceDocument(text: string, source: FlatDocumentSource, chapterNo: number): SourceDocument {
  // Normalise whitespace — remove form-feeds, excess blank lines.
  const normalised = text
    .replace(/\f/g, '\n\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = normalised.split(/\n\n+/).filter((p) => p.trim().length > 20);
  if (paragraphs.length === 0) {
    throw new Error('No extractable text found in PDF (all paragraphs empty after cleaning).');
  }

  // Group consecutive paragraphs into sections of <= MAX_SECTION_CHARS.
  const sections: SourceDocument['sections'] = [];
  let current = '';
  let sectionIndex = 1;

  for (const para of paragraphs) {
    if (current.length + para.length > MAX_SECTION_CHARS && current.length > 0) {
      sections.push({ section: `Section ${sectionIndex}`, content: current.trim() });
      sectionIndex++;
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) {
    sections.push({ section: `Section ${sectionIndex}`, content: current.trim() });
  }

  const yearLabel = source.year ? ` ${source.year}` : '';
  const sourceLabel = source.sourceType === 'past_paper' ? 'Past Paper' : 'Model Paper';

  return {
    board: source.board,
    classLevel: source.classLevel,
    subject: source.subject,
    chapterNo,
    chapterTitle: `${sourceLabel}${yearLabel} — ${source.subject.replace(/_/g, ' ')}`,
    sourceType: source.sourceType,
    language: source.language,
    sections,
  };
}
