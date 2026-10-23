'use client';

import { useState } from 'react';
import { BookOpen, CheckCircle2, HelpCircle } from 'lucide-react';
import type { AskResponse, Citation } from '@/lib/types';

export default function AskResultView({ result, selectedCitation, onCitation, onClarify, onEdit, onRetry }: {
  result: AskResponse; selectedCitation: Citation | null; onCitation: (citation: Citation) => void;
  onClarify: (optionId?: string, freeText?: string) => void; onEdit: (question: string) => void; onRetry: () => void;
}) {
  const [freeText, setFreeText] = useState('');
  const [edited, setEdited] = useState('interpretation' in result ? result.interpretation?.normalizedQuestion ?? '' : '');
  const interpretation = 'interpretation' in result ? result.interpretation : undefined;
  const interpretationLine = interpretation && interpretation.normalizedQuestion !== interpretation.originalQuestion && (
    <details className="text-xs text-text-2 border-b border-border pb-3">
      <summary className="cursor-pointer">We understood your question as: {interpretation.normalizedQuestion}</summary>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (edited.trim()) onEdit(edited); }}>
        <input aria-label="Edit understood question" value={edited} onChange={(e) => setEdited(e.target.value)} maxLength={1600} className="min-w-0 flex-1 bg-surface-2 border border-border rounded-lg p-2" />
        <button className="text-brand font-bold" type="submit">Ask this</button>
      </form>
    </details>
  );
  if (result.status === 'error') return (
    <div role="alert" className="bg-surface border border-border rounded-2xl p-6 space-y-3">
      <p className="text-sm text-navy-2">{result.message}</p>
      {result.retryable && <button type="button" onClick={onRetry} className="text-brand font-bold text-sm">Try again</button>}
    </div>
  );
  if (result.status === 'needs_clarification') return (
    <section aria-label="Clarify your question" className="bg-surface border border-border rounded-2xl p-6 space-y-4">
      <p className="text-sm font-semibold text-navy" dir="auto">{result.question}</p>
      <div className="flex flex-wrap gap-2">
        {result.options.map((option) => <button type="button" key={option.id} onClick={() => onClarify(option.id)} className="border border-brand/30 text-brand rounded-xl px-4 py-3 text-sm focus-visible:ring-2 focus-visible:ring-brand" dir="auto">{option.label}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (freeText.trim()) onClarify(undefined, freeText); }} className="space-y-2">
        <label htmlFor="ask-clarification" className="text-xs text-text-2">Something else / add the missing details</label>
        <textarea id="ask-clarification" dir="auto" value={freeText} onChange={(e) => setFreeText(e.target.value)} maxLength={1600} rows={2} className="w-full rounded-xl p-3 bg-surface-2 border border-border text-sm" />
        <button type="submit" disabled={!freeText.trim()} className="text-sm font-bold text-brand disabled:opacity-50">Continue</button>
      </form>
    </section>
  );
  if (result.status === 'refused') return (
    <section className="bg-surface border border-border rounded-2xl p-6 space-y-4">
      {interpretationLine}
      <div className="flex items-center gap-2 text-navy"><HelpCircle className="w-5 h-5" /><h3 className="text-sm font-bold">{result.reason === 'low_similarity' ? 'Search confidence too low' : result.reason === 'no_candidates' ? 'No passages retrieved' : 'Supported answer not confirmed'}</h3></div>
      <p className="text-sm text-navy-2" dir="auto">{result.message}</p>
      <p className="text-xs text-text-2" dir="auto">{result.suggestion}</p>
      {result.nearestChapters.length > 0 && <p className="text-xs text-text-2">Closest retrieved chapters: {result.nearestChapters.map((c) => c.chapterTitle ?? `Chapter ${c.chapterNo}`).join(', ')}</p>}
    </section>
  );
  const statementById = new Map(result.statements.map((s) => [s.id, s]));
  const groups = result.blocks?.map((b) => ({ kind: b.kind, statements: b.statementIds.map((id) => statementById.get(id)!).filter(Boolean) }))
    ?? [{ kind: 'direct_answer', statements: result.statements }];
  return (
    <section className="bg-surface border border-border rounded-2xl p-6 space-y-5">
      {interpretationLine}
      <div className="flex items-center gap-2 text-brand border-b border-border pb-3">
        <CheckCircle2 className="w-4 h-4" />
        <span className="text-xs font-bold">{result.boundary?.coverage === 'partial' ? 'Partly supported by retrieved material' : 'Grounded in retrieved material'} · {result.confidence.band === 'high' ? 'High' : 'Borderline'} retrieval confidence</span>
      </div>
      <div className="space-y-4 text-navy-2 text-sm leading-relaxed" dir={result.language === 'ur' ? 'rtl' : 'ltr'}>
        {groups.map((group, idx) => <div key={idx} className="space-y-3">
          {group.kind === 'explanation' && <h3 className="font-semibold">{result.language === 'ur' ? 'وضاحت' : 'Explanation'}</h3>}
          {group.statements.map((statement, index) => <p key={statement.id ?? index} className="whitespace-pre-wrap" style={{ unicodeBidi: 'plaintext' }}>
            {statement.kind === 'book_example' && <strong>{result.language === 'ur' ? 'کتاب کی مثال: ' : 'Textbook example: '}</strong>}
            {statement.kind === 'illustration' && <strong>{result.language === 'ur' ? 'وضاحتی مثال: ' : 'Illustration: '}</strong>}
            {statement.text}{' '}
            {statement.chunkIds.map((id) => { const citation = result.citations.find((c) => c.chunkId === id); return citation && (
              <button key={id} type="button" onClick={() => onCitation(citation)} aria-pressed={selectedCitation?.chunkId === id} className="inline-flex text-xs text-brand border border-brand/20 rounded-md px-2 py-0.5 mx-1" title={citation.section ?? citation.chapterTitle ?? 'Open source'}>
                <bdi dir="ltr">{citation.pageFrom === null ? 'Source' : `p. ${citation.pageFrom}`}</bdi>
              </button>
            ); })}
          </p>)}
        </div>)}
      </div>
      {result.notCovered && <p className="text-sm text-text-2 border-l-2 border-border pl-3" dir="auto">{result.notCovered}</p>}
      {result.boundary?.truncated && <p className="text-xs text-text-2">Some passages were excluded to keep the explanation within its context limit.</p>}
      <details className="text-xs text-text-2">
        <summary className="cursor-pointer font-semibold">Sources ({result.citations.length})</summary>
        <div className="mt-3 space-y-3">{result.citations.map((citation) => <div key={citation.chunkId}>
          <button type="button" onClick={() => onCitation(citation)} className="text-brand text-left flex gap-2"><BookOpen className="w-4 h-4 shrink-0" />{citation.chapterTitle ?? `Chapter ${citation.chapterNo}`} · {citation.section ?? 'Source passage'} · {citation.pageFrom === null ? 'Page unknown' : `p. ${citation.pageFrom}`}</button>
          <p className="mt-1 whitespace-pre-wrap" dir="auto">{citation.excerpt}</p>
        </div>)}</div>
      </details>
    </section>
  );
}
