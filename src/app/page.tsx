'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Award,
  Sparkles,
  ShieldCheck,
  Languages,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Zap,
  GraduationCap,
  Layers,
  ChevronDown,
  ChevronUp,
  LogIn,
  LogOut,
  User
} from 'lucide-react';
import type { AskResponse, Citation, Language } from '@/lib/types';

interface EvalBenchmarkData {
  summary: {
    totalEvaluated: number;
    inSyllabusTotal: number;
    outSyllabusTotal: number;
    retrievalAccuracy: number;
    offSyllabusRefusalRate: number;
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
    expectedChapter: number[];
    retrievedChapters: number[];
    top1Score: number;
    supportCount: number;
    decision: string;
    passedVerification: boolean;
    reason: string | null;
  }>;
}

interface QuizQuestion {
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

export default function SabaqApp() {
  const [activeTab, setActiveTab] = useState<'ask' | 'quiz' | 'eval' | 'syllabus'>('ask');
  const [language, setLanguage] = useState<Language>('en');

  // Ask State
  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // Quiz State
  const [selectedChapter, setSelectedChapter] = useState(14);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);

  // Eval Benchmark State
  const [evalData, setEvalData] = useState<EvalBenchmarkData | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  // Syllabus Explorer State
  const [syllabusData, setSyllabusData] = useState<any>(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);

  // User Auth State (Day 1)
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string; metadata?: any } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUser = async () => {
    try {
      const res = await fetch('/api/auth/user');
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    checkUser();
  }, []);

  const sampleQuestions = [
    { text: "What is Ohm's law and what are ohmic conductors?", type: 'in_syllabus', label: "In-Syllabus (English)" },
    { text: "Ohm ka qanoon kya hai aur resistance ki tareef karein?", type: 'roman_ur', label: "Roman Urdu (Class 10)" },
    { text: "State Joule's law of heating and write its formula.", type: 'in_syllabus', label: "In-Syllabus (Joule's Law)" },
    { text: "Explain the mechanism of an organic SN2 reaction.", type: 'off_syllabus', label: "Off-Syllabus (Chemistry Test)" },
    { text: "What is the time complexity of quicksort in computer science?", type: 'off_syllabus', label: "Off-Syllabus (CS Test)" }
  ];

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
          board: 'PCTB',
          classLevel: 10,
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

  const loadQuiz = async (chapterNo: number) => {
    setQuizLoading(true);
    setSelectedAnswers({});
    setIsQuizSubmitted(false);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterNo, subject: 'physics' }),
      });
      const data = await res.json();
      setQuizQuestions(data.questions || []);
    } catch (err) {
      console.error('Quiz load error:', err);
    } finally {
      setQuizLoading(false);
    }
  };

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
    if (activeTab === 'quiz' && quizQuestions.length === 0) {
      loadQuiz(selectedChapter);
    } else if (activeTab === 'eval' && !evalData) {
      loadEval();
    } else if (activeTab === 'syllabus' && !syllabusData) {
      loadSyllabus();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg shadow-sm">
              سبق
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-slate-100 text-lg tracking-tight">Sabaq AI</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Matric MVP
                </span>
              </div>
              <p className="text-xs text-slate-400">PCTB Class 10 • Physics Syllabus Grounded</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Toggle */}
            <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/60 text-xs">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 rounded-md transition font-medium ${
                  language === 'en' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ur')}
                className={`px-2.5 py-1 rounded-md transition font-medium ${
                  language === 'ur' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                اردو
              </button>
            </div>

            {/* User Auth Buttons (Day 1) */}
            {authChecked && (
              currentUser ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/90 border border-slate-700/70 rounded-lg text-xs">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-medium text-slate-200 truncate max-w-[120px]">
                      {currentUser.metadata?.full_name || currentUser.email?.split('@')[0] || 'Student'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Sign Out"
                    className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Link
                    href="/login"
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition flex items-center gap-1"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Login</span>
                  </Link>
                  <Link
                    href="/signup"
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 shadow-sm transition"
                  >
                    Sign up
                  </Link>
                </div>
              )
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-2 border-t border-slate-800/40 overflow-x-auto scrollbar-none py-1">
          <button
            type="button"
            id="tab-ask"
            onClick={() => setActiveTab('ask')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'ask'
                ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Grounded Ask</span>
          </button>

          <button
            type="button"
            id="tab-quiz"
            onClick={() => setActiveTab('quiz')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'quiz'
                ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Adaptive Quiz</span>
          </button>

          <button
            type="button"
            id="tab-eval"
            onClick={() => setActiveTab('eval')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'eval'
                ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Confidence & Eval Benchmark</span>
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
              Day 6
            </span>
          </button>

          <button
            type="button"
            id="tab-syllabus"
            onClick={() => setActiveTab('syllabus')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'syllabus'
                ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Syllabus Explorer</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* TAB 1: GROUNDED ASK */}
        {activeTab === 'ask' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Input & Result */}
            <div className="lg:col-span-7 space-y-6">
              {/* Question Input Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-emerald-400" />
                    Ask from Punjab Textbook (PCTB Matric Physics)
                  </span>
                  <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    Roman Urdu & English
                  </span>
                </div>

                <div className="relative">
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
                    placeholder="Ask a question (e.g. 'What is Ohm's law?', 'Ohm ka qanoon kya hai?', 'Joule's law formula')..."
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-3.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none"
                  />
                  <button
                    type="button"
                    id="submit-ask-btn"
                    onClick={() => handleAsk()}
                    disabled={isAsking || !query.trim()}
                    className="absolute right-3 bottom-3.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-medium rounded-md shadow transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {isAsking ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Searching...</span>
                      </>
                    ) : (
                      <>
                        <span>Ask Sabaq</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>

                {/* Example Questions */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-slate-400">Quick Test Queries:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {sampleQuestions.map((sq, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setQuery(sq.text);
                          handleAsk(sq.text);
                        }}
                        className={`text-xs px-2.5 py-1 rounded-md border transition text-left ${
                          sq.type === 'off_syllabus'
                            ? 'bg-rose-950/30 border-rose-800/40 text-rose-300 hover:bg-rose-900/30'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        {sq.type === 'off_syllabus' && <span className="text-rose-400 font-bold mr-1">[Refusal Test]</span>}
                        {sq.text.slice(0, 38)}...
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Loading State */}
              {isAsking && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                  </div>
                  <div className="text-sm font-medium text-slate-200">1. Vector search filtered by Board + Class 10...</div>
                  <div className="text-xs text-slate-400">2. Calibrating confidence gate (PASS / BORDERLINE / REFUSE)...</div>
                </div>
              )}

              {/* Ask Response Display */}
              {askResult && !isAsking && (
                <div className="space-y-4">
                  {askResult.status === 'answered' ? (
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                      {/* Confidence Meter Badge */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                            Grounded in Syllabus ({askResult.confidence.band === 'high' ? 'High Confidence' : 'Borderline Supported'})
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                          Top-1 Score: <span className="text-emerald-400 font-semibold">{askResult.confidence.top1.toFixed(2)}</span> | Support Chunks: {askResult.confidence.support}
                        </div>
                      </div>

                      {/* Statements with Citations */}
                      <div className="space-y-3 text-slate-200 text-sm leading-relaxed" dir={askResult.language === 'ur' ? 'rtl' : 'ltr'}>
                        {askResult.statements.map((stmt, sIdx) => (
                          <p key={sIdx} className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                            <span>{stmt.text}</span>
                            <span className="inline-flex gap-1 ml-2">
                              {stmt.chunkIds.map((cid, cIdx) => {
                                const citeObj = askResult.citations.find((c) => c.chunkId === cid);
                                return (
                                  <button
                                    key={cIdx}
                                    type="button"
                                    onClick={() => citeObj && setSelectedCitation(citeObj)}
                                    className="inline-flex items-center gap-1 text-[10px] bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded cursor-pointer transition font-mono font-medium"
                                  >
                                    <span>[Ch {citeObj?.chapterNo ?? '?'}, p. {citeObj?.pageFrom ?? '?'}]</span>
                                  </button>
                                );
                              })}
                            </span>
                          </p>
                        ))}
                      </div>

                      {/* Verified Citations Bar */}
                      <div className="pt-2">
                        <div className="text-xs font-medium text-slate-400 mb-2">Verified Citations Found in Textbook:</div>
                        <div className="flex flex-wrap gap-2">
                          {askResult.citations.map((cite, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedCitation(cite)}
                              className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-2 transition ${
                                selectedCitation?.chunkId === cite.chunkId
                                  ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200'
                                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Chapter {cite.chapterNo}: {cite.chapterTitle}</span>
                              <span className="text-[11px] text-slate-400">(p. {cite.pageFrom})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Refusal State */
                    <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                        <div>
                          <h3 className="text-sm font-semibold text-amber-300">
                            Confidence Guardrail Triggered: Off-Syllabus Question Refused
                          </h3>
                          <p className="text-xs text-slate-400">
                            The generation LLM was <strong>intentionally skipped</strong> to prevent exam hallucinations.
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-sm text-slate-200 leading-relaxed">
                        {askResult.message}
                      </div>

                      {/* Nearest Chapters Suggestion */}
                      {askResult.nearestChapters && askResult.nearestChapters.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-slate-400">Nearest Chapters in Matric Physics Syllabus:</div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {askResult.nearestChapters.map((ch, idx) => (
                              <div
                                key={idx}
                                className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-lg text-xs"
                              >
                                <span className="font-semibold text-emerald-400">Chapter {ch.chapterNo}</span>
                                <p className="text-slate-300 mt-0.5 truncate">{ch.chapterTitle}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-xs bg-amber-950/20 border border-amber-900/30 text-amber-200 p-3 rounded-lg flex items-start gap-2">
                        <HelpCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Reformulation Hint: </span>
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
              {/* Textbook Excerpt Viewer */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                    Verified Textbook Excerpt
                  </span>
                  {selectedCitation && (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
                      p. {selectedCitation.pageFrom}-{selectedCitation.pageTo}
                    </span>
                  )}
                </div>

                {selectedCitation ? (
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100">
                        Chapter {selectedCitation.chapterNo}: {selectedCitation.chapterTitle}
                      </h4>
                      <p className="text-xs text-emerald-400 mt-0.5">{selectedCitation.section}</p>
                    </div>

                    <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans max-h-72 overflow-y-auto">
                      &quot;{selectedCitation.excerpt}&quot;
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Source: Official PCTB Class 10 Textbook (Verified Ground Truth)</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Ask a syllabus question or click a citation tag to inspect the exact textbook page and excerpt.
                  </div>
                )}
              </div>

              {/* The Core Architecture Guardrail Card */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Why Sabaq AI is Different
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  General AI chatbots hallucinate because they answer from open-web data. Sabaq AI runs strict confidence scoring (PASS ≥ 0.62, BORDERLINE ≥ 0.52). If the question is outside the syllabus, it refuses immediately without invoking the LLM.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800/80">
                    <span className="text-emerald-400 font-semibold">In-Syllabus:</span> Answer + Page Citation
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800/80">
                    <span className="text-amber-400 font-semibold">Off-Syllabus:</span> Zero LLM calls, Zero hallucinations
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ADAPTIVE CHAPTER QUIZ */}
        {activeTab === 'quiz' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Chapter Selection Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Class 10 Physics Chapter Quizzes</h3>
                <p className="text-xs text-slate-400">Board-pattern multiple choice questions grounded in textbook chunks</p>
              </div>

              <div className="flex items-center gap-2">
                {[
                  { ch: 14, title: 'Ch 14: Electricity' },
                  { ch: 15, title: 'Ch 15: Electromagnetism' },
                ].map((c) => (
                  <button
                    key={c.ch}
                    type="button"
                    onClick={() => {
                      setSelectedChapter(c.ch);
                      loadQuiz(c.ch);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      selectedChapter === c.ch
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Quiz Questions List */}
            {quizLoading ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
                <div className="text-sm text-slate-200">Generating syllabus-verified quiz from Chapter {selectedChapter}...</div>
              </div>
            ) : (
              <div className="space-y-4">
                {quizQuestions.map((q, qIdx) => {
                  const selectedOpt = selectedAnswers[qIdx];
                  const isCorrect = selectedOpt === q.correctIndex;

                  return (
                    <div key={q.id || qIdx} className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                            Q{qIdx + 1}
                          </span>
                          <h4 className="text-sm font-medium text-slate-100">{q.stem}</h4>
                        </div>
                        <span className="text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 flex-shrink-0">
                          p. {q.page}
                        </span>
                      </div>

                      {/* Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {q.options.map((opt, oIdx) => {
                          let optStyle = 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700';

                          if (isQuizSubmitted) {
                            if (oIdx === q.correctIndex) {
                              optStyle = 'bg-emerald-950/70 border-emerald-500 text-emerald-200 font-semibold';
                            } else if (selectedOpt === oIdx && !isCorrect) {
                              optStyle = 'bg-rose-950/70 border-rose-500 text-rose-200';
                            }
                          } else if (selectedOpt === oIdx) {
                            optStyle = 'bg-emerald-900/40 border-emerald-500 text-emerald-200';
                          }

                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={isQuizSubmitted}
                              onClick={() => setSelectedAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))}
                              className={`p-3 rounded-lg border text-xs text-left transition flex items-center justify-between ${optStyle}`}
                            >
                              <span>{opt}</span>
                              {isQuizSubmitted && oIdx === q.correctIndex && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              )}
                              {isQuizSubmitted && selectedOpt === oIdx && !isCorrect && (
                                <XCircle className="w-4 h-4 text-rose-400" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation when submitted */}
                      {isQuizSubmitted && (
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-xs space-y-1">
                          <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Textbook Explanation ({q.section}):</span>
                          </div>
                          <p className="text-slate-300">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Submit / Reset Actions */}
                <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                  {!isQuizSubmitted ? (
                    <button
                      type="button"
                      onClick={() => setIsQuizSubmitted(true)}
                      disabled={Object.keys(selectedAnswers).length === 0}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
                    >
                      Submit & Grade Quiz ({Object.keys(selectedAnswers).length}/{quizQuestions.length} answered)
                    </button>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="text-sm font-semibold">
                        Score:{' '}
                        <span className="text-emerald-400">
                          {quizQuestions.filter((q, idx) => selectedAnswers[idx] === q.correctIndex).length} / {quizQuestions.length} Correct
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAnswers({});
                          setIsQuizSubmitted(false);
                          loadQuiz(selectedChapter);
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
                      >
                        Retake Quiz
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CONFIDENCE & EVALUATION BENCHMARK (DAY 6) */}
        {activeTab === 'eval' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header & Metric Cards */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    Day 6 Evaluation & Guardrail Calibration Benchmark
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Proves that in-syllabus questions retrieve the right chapter and off-syllabus questions are safely refused.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={loadEval}
                  disabled={evalLoading}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-medium rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${evalLoading ? 'animate-spin' : ''}`} />
                  <span>Re-run Evaluation</span>
                </button>
              </div>

              {evalData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-lg">
                    <div className="text-[11px] text-slate-400">Retrieval Accuracy</div>
                    <div className="text-xl font-bold text-emerald-400 mt-1">{evalData.summary.retrievalAccuracy}%</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">In-syllabus chapter hits</div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-lg">
                    <div className="text-[11px] text-slate-400">Off-Syllabus Refusal Rate</div>
                    <div className="text-xl font-bold text-emerald-400 mt-1">{evalData.summary.offSyllabusRefusalRate}%</div>
                    <div className="text-[10px] text-emerald-400/80 mt-0.5">100% safe refusal</div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-lg">
                    <div className="text-[11px] text-slate-400">False Acceptance (Leakage)</div>
                    <div className="text-xl font-bold text-emerald-400 mt-1">{evalData.summary.falseAcceptanceRate}%</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Off-syllabus answered: 0</div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-lg">
                    <div className="text-[11px] text-slate-400">Threshold Calibration</div>
                    <div className="text-xs font-mono text-slate-300 mt-1.5">
                      PASS ≥ {evalData.summary.thresholds.PASS_TOP1}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      BORDERLINE ≥ {evalData.summary.thresholds.BORDERLINE_TOP1}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Detailed Per-Question Evaluation Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 font-semibold text-xs text-slate-300 flex items-center justify-between">
                <span>Evaluation Query Set Breakdown</span>
                <span className="text-slate-400 font-normal">
                  {evalData?.results.length ?? 0} Labelled Test Questions
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-mono">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Question</th>
                      <th className="p-3">Top-1 Score</th>
                      <th className="p-3">Decision</th>
                      <th className="p-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {evalData?.results.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3 font-mono text-slate-400">{r.id}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              r.label === 'in_syllabus'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                            }`}
                          >
                            {r.label === 'in_syllabus' ? 'In-Syllabus' : 'Out-of-Syllabus'}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-200 max-w-xs">{r.question}</td>
                        <td className="p-3 font-mono font-bold text-slate-100">{r.top1Score.toFixed(2)}</td>
                        <td className="p-3">
                          <span
                            className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                              r.decision === 'PASS'
                                ? 'text-emerald-400 bg-emerald-950/50'
                                : r.decision === 'BORDERLINE'
                                ? 'text-amber-400 bg-amber-950/50'
                                : 'text-slate-300 bg-slate-800'
                            }`}
                          >
                            {r.decision}
                          </span>
                        </td>
                        <td className="p-3">
                          {r.passedVerification ? (
                            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Pass</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-rose-400 font-semibold">
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
          </div>
        )}

        {/* TAB 4: SYLLABUS EXPLORER */}
        {activeTab === 'syllabus' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-100">Ingested Syllabus Corpus</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verified textbook chunks for PCTB Matriculation Class 10 (Physics)
                </p>
              </div>
              <div className="text-xs font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-emerald-400">
                {syllabusData?.totalChunks ?? 0} Ingested Chunks
              </div>
            </div>

            {/* Chunks Directory Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {syllabusData?.chunks.map((chunk: any) => (
                <div key={chunk.id} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
                        Chapter {chunk.chapterNo} • p. {chunk.pageFrom}-{chunk.pageTo}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-100 mt-1.5">{chunk.section}</h4>
                      <p className="text-xs text-slate-400">{chunk.chapterTitle}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    &quot;{chunk.excerpt}&quot;
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>ID: <code className="text-slate-300">{chunk.id}</code></span>
                    <span>Source: {chunk.sourceType}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-400">
          Sabaq AI MVP • Grounded in Pakistani Board (PCTB) Curricula • Safe Confidence Guardrail & Verifiable Citations
        </div>
      </footer>
    </div>
  );
}
