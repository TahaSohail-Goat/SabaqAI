'use client';

import React, { useState } from 'react';
import { ShieldCheck, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface EvalBenchmarkData {
  summary: {
    totalEvaluated: number;
    inSyllabusTotal: number;
    outSyllabusTotal: number;
    nearMissTotal: number;
    retrievalAccuracy: number;
    offSyllabusRefusalRate: number;
    nearMissRefusalRate: number;
    falseAcceptanceRate: number;
    falseRefusalRate: number;
    thresholds: {
      PASS_TOP1: number;
      BORDERLINE_TOP1: number;
      SUPPORT_SCORE: number;
    };
  };
  results: Array<{
    id: string;
    question: string;
    lang: string;
    label: string;
    nearMiss: boolean;
    expectedChapter: number[];
    retrievedChapters: number[];
    top1Score: number;
    supportCount: number;
    decision: string;
    passedVerification: boolean;
    reason: string | null;
  }>;
}

export default function EvalPage() {
  const [evalData, setEvalData] = useState<EvalBenchmarkData | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  // Deliberately not auto-loaded: /api/eval runs retrieval once per question (slow, burns
  // quota — see AGENTS.md). It only runs from this page's own button.
  const loadEval = async () => {
    setEvalLoading(true);
    try {
      const res = await fetch('/api/eval');
      const data = await res.json();
      setEvalData(data);
    } catch (err) {
      console.error('Eval load error:', err);
    } finally {
      setEvalLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Metric Cards */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-navy flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand" />
              Evaluation & Guardrail Calibration Benchmark
            </h3>
            <p className="text-xs text-text-2 mt-1">
              Proves that in-syllabus questions retrieve the right chapter and off-syllabus questions are safely refused.
            </p>
          </div>

          <button
            type="button"
            onClick={loadEval}
            disabled={evalLoading}
            className="px-3.5 py-1.5 bg-brand hover:bg-brand-dark disabled:bg-disabled text-white text-xs font-medium rounded-lg transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evalLoading ? 'animate-spin' : ''}`} />
            <span>Re-run Evaluation</span>
          </button>
        </div>

        {evalData && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            <div className="bg-surface-2 border border-border p-3.5 rounded-lg">
              <div className="text-[11px] text-text-2">Retrieval Accuracy</div>
              <div className="text-xl font-bold text-brand mt-1">{evalData.summary.retrievalAccuracy}%</div>
              <div className="text-[10px] text-text-2 mt-0.5">In-syllabus chapter hits</div>
            </div>

            {/* The hard cases: same subject, wrong syllabus. This is the defensible number. */}
            <div className="bg-surface-2 border border-brand/30 p-3.5 rounded-lg ring-1 ring-brand/20">
              <div className="text-[11px] text-brand-dark">Near-Miss Refusal</div>
              <div className={`text-xl font-bold mt-1 ${
                evalData.summary.nearMissRefusalRate === 100 ? 'text-brand' : 'text-warning'
              }`}>
                {evalData.summary.nearMissRefusalRate}%
              </div>
              <div className="text-[10px] text-text-2 mt-0.5">
                Class 9/11 physics ({evalData.summary.nearMissTotal})
              </div>
            </div>

            <div className="bg-surface-2 border border-border p-3.5 rounded-lg">
              <div className="text-[11px] text-text-2">Off-Syllabus Refusal Rate</div>
              <div className={`text-xl font-bold mt-1 ${
                evalData.summary.offSyllabusRefusalRate === 100 ? 'text-brand' : 'text-warning'
              }`}>
                {evalData.summary.offSyllabusRefusalRate}%
              </div>
              <div className="text-[10px] text-text-2 mt-0.5">
                of {evalData.summary.outSyllabusTotal} off-syllabus questions
              </div>
            </div>

            <div className="bg-surface-2 border border-border p-3.5 rounded-lg">
              <div className="text-[11px] text-text-2">False Acceptance (Leakage)</div>
              <div className={`text-xl font-bold mt-1 ${
                evalData.summary.falseAcceptanceRate === 0 ? 'text-brand' : 'text-error'
              }`}>
                {evalData.summary.falseAcceptanceRate}%
              </div>
              <div className="text-[10px] text-text-2 mt-0.5">
                Off-syllabus answered:{' '}
                {Math.round(
                  (evalData.summary.falseAcceptanceRate / 100) * evalData.summary.outSyllabusTotal
                )}
              </div>
            </div>

            <div className="bg-surface-2 border border-border p-3.5 rounded-lg">
              <div className="text-[11px] text-text-2">Threshold Calibration</div>
              <div className="text-xs font-mono text-navy-2 mt-1.5">
                PASS ≥ {evalData.summary.thresholds.PASS_TOP1}
              </div>
              <div className="text-[10px] text-text-2 font-mono">
                BORDERLINE ≥ {evalData.summary.thresholds.BORDERLINE_TOP1}
              </div>
            </div>
          </div>
        )}
      </div>

      {!evalData && (
        <div className="bg-surface border border-border rounded-card p-8 text-center space-y-3">
          {evalLoading ? (
            <>
              <RefreshCw className="w-6 h-6 text-brand animate-spin mx-auto" />
              <p className="text-sm text-navy-2">Running the labelled question set against live retrieval…</p>
            </>
          ) : (
            <>
              <p className="text-sm text-navy-2">
                Runs 15 labelled questions against live retrieval. This is slow and uses API quota — run it deliberately.
              </p>
              <button
                type="button"
                onClick={loadEval}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Run evaluation
              </button>
            </>
          )}
        </div>
      )}

      {evalData && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border font-semibold text-xs text-navy-2 flex items-center justify-between">
            <span>Evaluation Query Set Breakdown</span>
            <span className="text-text-2 font-normal">
              {evalData?.results.length ?? 0} Labelled Test Questions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-text-2 border-b border-border font-mono">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Question</th>
                  <th className="p-3">Top-1 Score</th>
                  <th className="p-3">Decision</th>
                  <th className="p-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {evalData?.results.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2 transition">
                    <td className="p-3 font-mono text-text-2">{r.id}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          r.label === 'in_syllabus'
                            ? 'bg-brand-light text-brand-dark border border-brand/30'
                            : r.nearMiss
                            ? 'bg-subj-physics/10 text-subj-physics border border-subj-physics/30'
                            : 'bg-quiz-light text-navy border border-quiz-border'
                        }`}
                      >
                        {r.label === 'in_syllabus'
                          ? 'In-Syllabus'
                          : r.nearMiss
                          ? 'Near-Miss'
                          : 'Out-of-Syllabus'}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-navy-2 max-w-xs">{r.question}</td>
                    <td className="p-3 font-mono font-bold text-navy">{r.top1Score.toFixed(2)}</td>
                    <td className="p-3">
                      <span
                        className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                          r.decision === 'PASS'
                            ? 'text-brand bg-brand-light'
                            : r.decision === 'BORDERLINE'
                            ? 'text-warning bg-quiz-light'
                            : 'text-navy-2 bg-surface-2'
                        }`}
                      >
                        {r.decision}
                      </span>
                    </td>
                    <td className="p-3">
                      {r.passedVerification ? (
                        <span className="flex items-center gap-1 text-brand font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Pass</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-error font-semibold">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Fail</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
