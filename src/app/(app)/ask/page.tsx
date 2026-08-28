'use client';

import React, { useState } from 'react';
import {
  GraduationCap,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  BookOpen,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { AskResponse, Citation } from '@/lib/types';
import { useScope } from '@/components/app/ScopeContext';

const sampleQuestions = [
  { text: "What is Ohm's law and what are ohmic conductors?", type: 'in_syllabus', label: 'In-Syllabus (English)' },
  { text: 'Ohm ka qanoon kya hai aur resistance ki tareef karein?', type: 'roman_ur', label: 'Roman Urdu (Class 10)' },
  { text: "State Joule's law of heating and write its formula.", type: 'in_syllabus', label: "In-Syllabus (Joule's Law)" },
  { text: 'Explain the mechanism of an organic SN2 reaction.', type: 'off_syllabus', label: 'Off-Syllabus (Chemistry Test)' },
  { text: 'What is the time complexity of quicksort in computer science?', type: 'off_syllabus', label: 'Off-Syllabus (CS Test)' },
];

export default function AskPage() {
  const { board, classLevel, language } = useScope();

  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  const handleAsk = async (questionToAsk?: string) => {
    const q = questionToAsk || query;
    if (!q.trim() || isAsking) return;

    setIsAsking(true);
    setAskResult(null);
    setSelectedCitation(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.trim(),
          board,
          classLevel,
          subject: 'physics',
          language,
        }),
      });
      const data: AskResponse = await res.json();
      setAskResult(data);
      if (data.status === 'answered' && data.citations.length > 0) {
        setSelectedCitation(data.citations[0]);
      }
    } catch (err) {
      console.error('Ask error:', err);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      {/* Left: Input & Result */}
      <div className="lg:col-span-7 space-y-6">

        {/* Question Input Card */}
        <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-sm focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand/20 transition-all duration-300 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-light/30 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-text-2 flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-brand-mint text-brand"><GraduationCap className="w-4 h-4" /></span>
              Ask from your syllabus
            </span>
            <span className="text-[10px] text-text-2 bg-surface-2 px-2 py-1 rounded-md font-semibold tracking-wide">
              {board} · Class {classLevel}
            </span>
          </div>

          <div className="relative z-10">
            <textarea
              id="question-input"
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              placeholder="Ask a question (e.g. 'What is Ohm's law?', 'Joule's law formula')..."
              className="w-full bg-surface-2 border border-border/50 rounded-xl p-4 text-sm text-navy placeholder:text-text-3 focus:outline-none focus:border-brand/50 focus:bg-surface transition-colors resize-none shadow-inner"
            />
            <button
              type="button"
              id="submit-ask-btn"
              onClick={() => handleAsk()}
              disabled={isAsking || !query.trim()}
              className="absolute right-3 bottom-3.5 px-5 py-2 bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand disabled:from-disabled disabled:to-disabled disabled:text-disabled-text text-white text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all active:scale-[0.97] flex items-center gap-2 group cursor-pointer"
            >
              {isAsking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Searching</span>
                </>
              ) : (
                <>
                  <span>Ask Sabaq</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>

          <div className="space-y-2 pt-2 relative z-10">
            <div className="text-[10px] font-bold text-text-3 uppercase tracking-wide">Quick Test Queries:</div>
            <div className="flex flex-wrap gap-2">
              {sampleQuestions.map((sq, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuery(sq.text);
                    handleAsk(sq.text);
                  }}
                  className={`text-[11px] px-3 py-1.5 rounded-full border transition-all duration-300 text-left hover:-translate-y-0.5 shadow-sm hover:shadow ${
                    sq.type === 'off_syllabus'
                      ? 'bg-surface border-warning/30 text-warning hover:bg-warning/5'
                      : 'bg-surface border-border text-navy-2 hover:border-brand/30 hover:text-brand'
                  }`}
                >
                  {sq.type === 'off_syllabus' && <span className="text-warning font-bold mr-1">⚠️ [Refusal]</span>}
                  {sq.text.slice(0, 38)}...
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isAsking && (
          <div className="bg-surface border border-border/50 rounded-2xl p-8 text-center space-y-4 shadow-sm relative overflow-hidden">
            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
            </div>
            <div className="text-sm font-semibold text-navy">Vector search filtered by {board} + Class {classLevel}</div>
            <div className="text-xs text-text-2">Calibrating confidence gate (PASS / BORDERLINE / REFUSE)...</div>
          </div>
        )}

        {/* Ask Response Display */}
        {askResult && !isAsking && (
          <div className="space-y-4 animate-fade-up">
            {askResult.status === 'answered' ? (
              <div className="bg-ai-light border border-ai-border rounded-2xl p-6 shadow-sm space-y-5">

                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-ai-border/50">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-full shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-brand" />
                    <span className="text-xs font-bold text-brand uppercase tracking-wide">
                      Grounded ({askResult.confidence.band === 'high' ? 'High' : 'Borderline'})
                    </span>
                  </div>
                  <div className="text-[11px] font-mono font-semibold text-text-2 bg-surface px-3 py-1.5 rounded-full shadow-sm border border-border/50">
                    Top-1: <span className="text-ai font-bold">{askResult.confidence.top1.toFixed(2)}</span> · Support: {askResult.confidence.support}
                  </div>
                </div>

                <div className="space-y-4 text-navy-2 text-sm leading-relaxed" dir={askResult.language === 'ur' ? 'rtl' : 'ltr'}>
                  {askResult.statements.map((stmt, sIdx) => (
                    <div key={sIdx} className="bg-surface p-4 rounded-xl shadow-sm border border-border/30 transition-all hover:shadow-md">
                      <span>{stmt.text}</span>
                      <span className="inline-flex gap-1.5 ml-2">
                        {stmt.chunkIds.map((cid, cIdx) => {
                          const citeObj = askResult.citations.find((c) => c.chunkId === cid);
                          return (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() => citeObj && setSelectedCitation(citeObj)}
                              className="inline-flex items-center gap-1 text-[11px] bg-brand-mint hover:bg-brand-light text-brand-dark border border-brand/20 px-2 py-0.5 rounded-md cursor-pointer transition-all hover:ring-1 hover:ring-brand/50 font-mono font-bold shadow-sm"
                            >
                              <span>[Ch {citeObj?.chapterNo ?? '?'}, p. {citeObj?.pageFrom ?? '?'}]</span>
                            </button>
                          );
                        })}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-3">
                  <div className="text-[10px] font-bold text-text-3 mb-2 uppercase tracking-wide">Verified Sources:</div>
                  <div className="flex flex-wrap gap-2">
                    {askResult.citations.map((cite, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedCitation(cite)}
                        className={`text-xs px-3 py-2 rounded-xl border flex items-center gap-2 transition-all duration-300 shadow-sm ${
                          selectedCitation?.chunkId === cite.chunkId
                            ? 'bg-brand text-white border-brand scale-105 shadow-md'
                            : 'bg-surface border-border text-navy-2 hover:border-brand/30 hover:shadow-md'
                        }`}
                      >
                        <BookOpen className={`w-3.5 h-3.5 ${selectedCitation?.chunkId === cite.chunkId ? 'text-brand-mint' : 'text-brand'}`} />
                        <span className="font-semibold">Ch {cite.chapterNo}: {cite.chapterTitle}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Refusal State - Calm, Neutral, Warning (Never Red) */
              <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-border/50">
                  <div className="p-2 rounded-full bg-warning/10 text-warning">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-navy">
                      Off-Syllabus Question Refused
                    </h3>
                    <p className="text-[11px] text-text-2 mt-0.5 font-medium">
                      The generation LLM was <strong className="text-navy-2">intentionally skipped</strong> to prevent exam hallucinations.
                    </p>
                  </div>
                </div>

                <div className="bg-surface-2/50 p-4 rounded-xl border border-border/50 text-sm text-navy-2 leading-relaxed">
                  {askResult.message}
                </div>

                {askResult.nearestChapters && askResult.nearestChapters.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold text-text-3 uppercase tracking-wide">Nearest Chapters in Matric Physics:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {askResult.nearestChapters.map((ch, idx) => (
                        <div
                          key={idx}
                          className="bg-surface border border-border/50 p-3 rounded-xl text-xs shadow-sm hover:shadow-md transition-shadow cursor-default"
                        >
                          <span className="font-bold text-brand block mb-1">Chapter {ch.chapterNo}</span>
                          <span className="text-navy-2 truncate block">{ch.chapterTitle}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs bg-warning/5 border border-warning/20 text-navy-2 p-3.5 rounded-xl flex items-start gap-3 shadow-inner">
                  <HelpCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold">Reformulation Hint: </span>
                    <span>{askResult.suggestion}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Citation Excerpt Inspector & Guardrail Explanation */}
      <div className="lg:col-span-5 space-y-6">

        <div className="bg-surface/70 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-xl shadow-navy/5 space-y-4 sticky top-24 transition-all">
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <span className="text-xs font-bold uppercase tracking-wider text-text-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand" />
              Verified Excerpt
            </span>
            {selectedCitation && (
              <span className="text-[10px] font-mono font-bold text-brand bg-brand-mint border border-brand/20 px-2 py-1 rounded-md shadow-sm">
                p. {selectedCitation.pageFrom}-{selectedCitation.pageTo}
              </span>
            )}
          </div>

          {selectedCitation ? (
            <div className="space-y-4 animate-fade-up">
              <div>
                <h4 className="text-sm font-bold text-navy leading-tight">
                  Chapter {selectedCitation.chapterNo}: {selectedCitation.chapterTitle}
                </h4>
                <p className="text-[11px] font-semibold text-brand mt-1 uppercase tracking-wide">{selectedCitation.section}</p>
              </div>

              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand rounded-l-md"></div>
                <div className="bg-surface-2/80 backdrop-blur-sm pl-4 pr-3 py-4 rounded-r-xl border border-border/50 text-xs text-navy-2 leading-relaxed font-sans max-h-72 overflow-y-auto shadow-inner">
                  &quot;{selectedCitation.excerpt}&quot;
                </div>
              </div>

              <div className="text-[10px] text-text-2 flex items-center gap-1.5 font-medium bg-surface px-3 py-2 rounded-lg border border-border/30 shadow-sm">
                <ShieldCheck className="w-4 h-4 text-brand" />
                <span>Source: Official PCTB Class 10 Textbook (Verified Ground Truth)</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 opacity-60">
              <BookOpen className="w-10 h-10 text-text-3" />
              <p className="text-text-2 text-xs font-medium max-w-[200px]">
                Ask a syllabus question or click a citation tag to inspect the exact textbook page and excerpt.
              </p>
            </div>
          )}
        </div>

        <div className="bg-surface-2 border border-border/50 rounded-2xl p-5 space-y-3 shadow-inner">
          <h4 className="text-[11px] font-bold text-navy-2 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-warning" />
            Why Sabaq AI is Different
          </h4>
          <p className="text-[11px] text-text-2 leading-relaxed font-medium">
            General AI chatbots hallucinate because they answer from open-web data. Sabaq AI
            scores retrieval confidence before generating. If the question is outside the syllabus, it refuses
            immediately without invoking the LLM.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2 text-[10px]">
            <div className="bg-surface p-2.5 rounded-lg border border-border/50 shadow-sm">
              <span className="text-brand font-bold block mb-0.5">In-Syllabus:</span> Answer + Page Citation
            </div>
            <div className="bg-surface p-2.5 rounded-lg border border-border/50 shadow-sm">
              <span className="text-warning font-bold block mb-0.5">Off-Syllabus:</span> Zero LLM calls, Zero hallucinations
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
