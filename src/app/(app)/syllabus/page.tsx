'use client';

import React, { useEffect, useState } from 'react';

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
  totalChunks: number;
  chunks: SyllabusChunk[];
}

export default function SyllabusPage() {
  const [syllabusData, setSyllabusData] = useState<SyllabusData | null>(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);

  const loadSyllabus = async () => {
    setSyllabusLoading(true);
    try {
      const res = await fetch('/api/syllabus');
      const data = await res.json();
      setSyllabusData(data);
    } catch (err) {
      console.error('Syllabus load error:', err);
    } finally {
      setSyllabusLoading(false);
    }
  };

  useEffect(() => {
    loadSyllabus();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-surface border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-navy">Ingested Syllabus Corpus</h3>
          <p className="text-xs text-text-2 mt-0.5">
            Verified textbook chunks for PCTB Matriculation Class 10 (Physics)
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
