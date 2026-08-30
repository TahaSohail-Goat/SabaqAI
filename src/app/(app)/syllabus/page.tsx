'use client';

import React, { useEffect, useState } from 'react';
import { useScope } from '@/components/app/ScopeContext';
import { SUBJECTS, SUBJECT_LABELS } from '@/lib/subjects';

interface SyllabusChunk {
  id: string;
  chapterNo: number;
  chapterTitle: string;
  section: string;
  pageFrom: number;
  pageTo: number;
  excerpt: string;
  sourceType: string;
}

interface SyllabusData {
  board: string;
  classLevel: number;
  subject: string;
  totalChunks: number;
  chunks: SyllabusChunk[];
}

export default function SyllabusPage() {
  const { board, classLevel, subject, setSubject } = useScope();
  const [syllabusData, setSyllabusData] = useState<SyllabusData | null>(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSyllabusLoading(true);
    const params = new URLSearchParams({ board, classLevel: String(classLevel), subject });
    fetch(`/api/syllabus?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSyllabusData(data);
      })
      .catch((err) => console.error('Syllabus load error:', err))
      .finally(() => {
        if (!cancelled) setSyllabusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [board, classLevel, subject]);

  const subjectLabel = SUBJECT_LABELS[subject] || subject;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Subject filter */}
      <div className="bg-surface border border-border/60 rounded-2xl p-5 space-y-3">
        <div>
          <p className="text-sm font-bold text-navy">Subject</p>
          <p className="text-xs text-text-2 mt-0.5">Browsing chunks for this subject.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => setSubject(s.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                subject === s.code
                  ? 'bg-brand text-white border-brand'
                  : 'bg-surface-2 text-navy-2 border-border hover:border-brand/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-navy">Ingested Syllabus Corpus</h3>
          <p className="text-xs text-text-2 mt-0.5">
            Verified textbook chunks for {syllabusData?.board ?? board} Class {syllabusData?.classLevel ?? classLevel} ({SUBJECT_LABELS[syllabusData?.subject ?? subject] || syllabusData?.subject || subjectLabel})
          </p>
        </div>
        <div className="text-xs font-mono bg-surface-2 px-3 py-1.5 rounded-lg border border-border text-brand">
          {syllabusData?.totalChunks ?? 0} Ingested Chunks
        </div>
      </div>

      {syllabusLoading ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-brand/20 border-t-brand animate-spin mx-auto" />
        </div>
      ) : (syllabusData?.chunks.length ?? 0) === 0 ? (
        <div className="bg-surface-muted border border-border rounded-2xl p-8 text-center text-sm text-text-2">
          No content has been ingested for {syllabusData?.board ?? board} Class {syllabusData?.classLevel ?? classLevel} {subjectLabel} yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {syllabusData?.chunks.map((chunk) => (
            <div key={chunk.id} className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono text-brand bg-brand-mint border border-brand/20 px-2 py-0.5 rounded">
                    Chapter {chunk.chapterNo} • p. {chunk.pageFrom}-{chunk.pageTo}
                  </span>
                  <h4 className="text-sm font-semibold text-navy mt-1.5">{chunk.section}</h4>
                  <p className="text-xs text-text-2">{chunk.chapterTitle}</p>
                </div>
              </div>

              <p className="text-xs text-navy-2 leading-relaxed bg-surface-2 p-3 rounded-lg border border-border">
                &quot;{chunk.excerpt}&quot;
              </p>

              <div className="flex items-center justify-between text-[11px] text-text-2 pt-1">
                <span>ID: <code className="text-navy-2">{chunk.id}</code></span>
                <span>Source: {chunk.sourceType}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
