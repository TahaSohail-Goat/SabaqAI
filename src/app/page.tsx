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

// No correctIndex or explanation — the server withholds the answer key until submission.
interface QuizQuestion {
  id: string;
  position: number;
  stem: string;
  options: string[];
  chunkId: string;
  chapterNo: number;
  page: number;
  section: string;
}

interface GradedQuestion {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string;
}

interface QuizGrade {
  score: number;
  total: number;
  answered: number;
  results: GradedQuestion[];
}

export default function SabaqApp() {
  const [activeTab, setActiveTab] = useState<'ask' | 'quiz' | 'eval' | 'syllabus'>('ask');
  const [language, setLanguage] = useState<Language>('en');
  // Board + class are chosen here in the app, not at signup — they scope every retrieval.
  const [board, setBoard] = useState('PCTB');
  const [classLevel, setClassLevel] = useState(10);

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
  const [answerToken, setAnswerToken] = useState<string | null>(null);
  const [quizGrade, setQuizGrade] = useState<QuizGrade | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [isGrading, setIsGrading] = useState(false);

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

  const loadQuiz = async (chapterNo: number) => {
    setQuizLoading(true);
    setSelectedAnswers({});
    setIsQuizSubmitted(false);
    setQuizGrade(null);
    setGradeError(null);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterNo, subject: 'physics' }),
      });
      const data = await res.json();
      setQuizQuestions(data.questions || []);
      setAnswerToken(data.answerToken ?? null);
    } catch (err) {
      console.error('Quiz load error:', err);
    } finally {
      setQuizLoading(false);
    }
  };

  // Grading happens on the server — the browser never held the answer key.
  const submitQuiz = async () => {
    if (!answerToken || isGrading) return;
    setIsGrading(true);
    setGradeError(null);

    const answersById: Record<string, number> = {};
    quizQuestions.forEach((q, idx) => {
      const selected = selectedAnswers[idx];
      if (typeof selected === 'number') answersById[q.id] = selected;
    });

    try {
      const res = await fetch('/api/quiz/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerToken, answers: answersById }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGradeError(data.error || 'Could not grade this quiz. Load a new one and try again.');
        return;
      }
      setQuizGrade(data);
      setIsQuizSubmitted(true);
    } catch {
      setGradeError('Could not reach the server to grade this quiz. Check your connection.');
    } finally {
      setIsGrading(false);
    }
  };

  const gradeFor = (questionId: string): GradedQuestion | undefined =>
    quizGrade?.results.find((r) => r.questionId === questionId);

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
    // /api/eval is deliberately NOT auto-loaded here: it runs retrieval once per
    // question (slow, burns quota — see AGENTS.md). It only runs from its own button.
    if (activeTab === 'quiz' && quizQuestions.length === 0) {
      loadQuiz(selectedChapter);
    } else if (activeTab === 'syllabus' && !syllabusData) {
      loadSyllabus();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-page text-navy flex flex-col selection:bg-brand/20">
      {/* Top Header - Glassmorphism */}
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-lg border-b border-border/50 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0 cursor-default">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-light to-brand-mint border border-brand/20 flex items-center justify-center text-brand font-bold text-xl shadow-inner transition-transform hover:scale-105">
              سبق
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold tracking-tight text-lg">
                  <span className="text-navy">Sabaq</span> <span className="text-brand">AI</span>
                </h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-light text-brand-dark font-semibold tracking-wide uppercase shadow-sm">
                  MVP
                </span>
              </div>
              <p className="text-[11px] text-text-2 font-medium tracking-wide">Physics Syllabus Grounded</p>
            </div>
          </div>

          {/* Center Navigation - Pill-shaped Tabs */}
          <div className="hidden md:flex flex-1 justify-center">
            <div className="flex bg-surface-2/80 backdrop-blur-md p-1 rounded-full border border-white/50 shadow-inner gap-1">
              {[
                { id: 'ask', icon: Search, label: 'Ask' },
                { id: 'quiz', icon: Award, label: 'Quiz' },
                { id: 'eval', icon: ShieldCheck, label: 'Evaluation' },
                { id: 'syllabus', icon: BookOpen, label: 'Syllabus' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ease-out ${
                    activeTab === tab.id
                      ? 'bg-white text-brand shadow-sm scale-100 ring-1 ring-black/5'
                      : 'text-text-2 hover:text-navy hover:bg-white/50 scale-95'
                  }`}
                >
                  <tab.icon className={`w-4 h-4 transition-colors ${activeTab === tab.id ? 'text-brand' : 'text-text-3'}`} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right Controls - Board/Class, Lang, User */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Scope Selectors */}
            <div className="hidden lg:flex items-center gap-2 py-1 px-3 bg-surface-2/80 rounded-full border border-white/50 shadow-inner">
              <div className="flex items-center">
                <span className="text-[10px] text-text-2 font-medium mr-1.5 uppercase tracking-wide">Board</span>
                <div className="relative">
                  <select
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                    className="appearance-none bg-transparent text-xs font-semibold text-navy pr-4 focus:outline-none cursor-pointer"
                  >
                    <option value="PCTB">PCTB</option>
                    <option value="FBISE">FBISE</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-text-3 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div className="w-px h-3 bg-border mx-1"></div>
              <div className="flex items-center">
                <span className="text-[10px] text-text-2 font-medium mr-1.5 uppercase tracking-wide">Class</span>
                <div className="relative">
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(Number(e.target.value))}
                    className="appearance-none bg-transparent text-xs font-semibold text-navy pr-4 focus:outline-none cursor-pointer"
                  >
                    <option value={9}>9</option>
                    <option value={10}>10</option>
                    <option value={11}>11</option>
                    <option value={12}>12</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-text-3 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Language Pill Toggle */}
            <div className="flex bg-surface-2 p-0.5 rounded-full border border-border/50 shadow-inner">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all duration-300 ${
                  language === 'en' ? 'bg-white text-navy shadow-sm' : 'text-text-2 hover:text-navy'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ur')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all duration-300 ${
                  language === 'ur' ? 'bg-white text-navy shadow-sm' : 'text-text-2 hover:text-navy'
                }`}
              >
                اردو
              </button>
            </div>

            {/* User Auth */}
            {authChecked && (
              currentUser ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-2 px-3 py-1 bg-brand-mint border border-brand/20 rounded-full text-xs shadow-sm hover:shadow transition-shadow">
                    <User className="w-3.5 h-3.5 text-brand" />
                    <span className="font-semibold text-brand-dark truncate max-w-[100px]">
                      {currentUser.metadata?.full_name || currentUser.email?.split('@')[0] || 'Student'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Sign Out"
                    className="p-1.5 rounded-full bg-surface-2 hover:bg-error-bg text-text-3 hover:text-error transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Link
                    href="/login"
                    className="px-3 py-1.5 rounded-full text-xs font-semibold text-navy-2 hover:bg-surface-2 transition-colors flex items-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Login</span>
                  </Link>
                  <Link
                    href="/signup"
                    className="px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-brand hover:bg-brand-dark shadow-sm hover:shadow transition-all active:scale-95"
                  >
                    Sign up
                  </Link>
                </div>
              )
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* TAB 1: GROUNDED ASK */}
        {activeTab === 'ask' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            {/* Left: Input & Result */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Question Input Card - Premium Focus Glow */}
              <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-sm focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand/20 transition-all duration-300 space-y-4 relative overflow-hidden">
                {/* Decorative background accent */}
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
                    className="w-full bg-surface-2 border border-border/50 rounded-xl p-4 text-sm text-navy placeholder:text-text-3 focus:outline-none focus:border-brand/50 focus:bg-white transition-colors resize-none shadow-inner"
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

                {/* Example Questions - Sleek Pills */}
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
                             ? 'bg-white border-warning/30 text-warning hover:bg-warning/5'
                             : 'bg-white border-border text-navy-2 hover:border-brand/30 hover:text-brand'
                         }`}
                      >
                         {sq.type === 'off_syllabus' && <span className="text-warning font-bold mr-1">⚠️ [Refusal]</span>}
                         {sq.text.slice(0, 38)}...
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Loading State - Premium Shimmer */}
              {isAsking && (
                <div className="bg-surface border border-border/50 rounded-2xl p-8 text-center space-y-4 shadow-sm relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-light/20 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                  <div className="flex justify-center">
                    <div className="w-10 h-10 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
                  </div>
                  <div className="text-sm font-semibold text-navy">Vector search filtered by {board} + Class {classLevel}</div>
                  <div className="text-xs text-text-2">Calibrating confidence gate (PASS / BORDERLINE / REFUSE)...</div>
                </div>
              )}

              {/* Ask Response Display */}
              {askResult && !isAsking && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {askResult.status === 'answered' ? (
                    <div className="bg-ai-light border border-ai-border rounded-2xl p-6 shadow-sm space-y-5">
                      
                      {/* Confidence Meter Badge */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-ai-border/50">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full shadow-sm">
                          <CheckCircle2 className="w-4 h-4 text-brand" />
                          <span className="text-xs font-bold text-brand uppercase tracking-wide">
                            Grounded ({askResult.confidence.band === 'high' ? 'High' : 'Borderline'})
                          </span>
                        </div>
                        <div className="text-[11px] font-mono font-semibold text-text-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-border/50">
                          Top-1: <span className="text-ai font-bold">{askResult.confidence.top1.toFixed(2)}</span> · Support: {askResult.confidence.support}
                        </div>
                      </div>

                      {/* Statements with Interactive Citation Chips */}
                      <div className="space-y-4 text-navy-2 text-sm leading-relaxed" dir={askResult.language === 'ur' ? 'rtl' : 'ltr'}>
                        {askResult.statements.map((stmt, sIdx) => (
                          <div key={sIdx} className="bg-white p-4 rounded-xl shadow-sm border border-border/30 transition-all hover:shadow-md">
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

                      {/* Verified Citations Bar */}
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
                                  : 'bg-white border-border text-navy-2 hover:border-brand/30 hover:shadow-md'
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

                      {/* Nearest Chapters Suggestion */}
                      {askResult.nearestChapters && askResult.nearestChapters.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-[10px] font-bold text-text-3 uppercase tracking-wide">Nearest Chapters in Matric Physics:</div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {askResult.nearestChapters.map((ch, idx) => (
                              <div
                                key={idx}
                                className="bg-white border border-border/50 p-3 rounded-xl text-xs shadow-sm hover:shadow-md transition-shadow cursor-default"
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
              
              {/* Textbook Excerpt Viewer - Glassmorphism Trust Panel */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-6 shadow-xl shadow-navy/5 space-y-4 sticky top-24 transition-all">
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
                  <div className="space-y-4 animate-in fade-in duration-300">
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

                    <div className="text-[10px] text-text-2 flex items-center gap-1.5 font-medium bg-white px-3 py-2 rounded-lg border border-border/30 shadow-sm">
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

              {/* The Core Architecture Guardrail Card */}
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
                  <div className="bg-white p-2.5 rounded-lg border border-border/50 shadow-sm">
                    <span className="text-brand font-bold block mb-0.5">In-Syllabus:</span> Answer + Page Citation
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-border/50 shadow-sm">
                    <span className="text-warning font-bold block mb-0.5">Off-Syllabus:</span> Zero LLM calls, Zero hallucinations
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
            <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-navy">Class {classLevel} Physics Chapter Quizzes</h3>
                <p className="text-xs text-text-2">Board-pattern multiple choice questions grounded in textbook chunks</p>
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
                        ? 'bg-brand text-white border-brand'
                        : 'bg-surface-2 text-navy-2 border-border-strong hover:bg-border'
                    }`}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Quiz Questions List */}
            {quizLoading ? (
              <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
                <div className="text-sm text-navy-2">Generating syllabus-verified quiz from Chapter {selectedChapter}...</div>
              </div>
            ) : (
              <div className="space-y-4">
                {quizQuestions.map((q, qIdx) => {
                  const selectedOpt = selectedAnswers[qIdx];
                  const graded = gradeFor(q.id);
                  const isCorrect = graded?.correct ?? false;

                  return (
                    <div key={q.id || qIdx} className="bg-surface border border-border rounded-xl p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-surface-2 text-brand border border-border-strong">
                            Q{qIdx + 1}
                          </span>
                          <h4 className="text-sm font-medium text-navy">{q.stem}</h4>
                        </div>
                        <span className="text-[11px] text-text-2 bg-surface-2 px-2 py-0.5 rounded border border-border flex-shrink-0">
                          p. {q.page}
                        </span>
                      </div>

                      {/* Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {q.options.map((opt, oIdx) => {
                          let optStyle = 'bg-surface-2 border-border text-navy-2 hover:border-border-strong';

                          if (graded) {
                            if (oIdx === graded.correctIndex) {
                              optStyle = 'bg-brand-light border-brand text-brand-dark font-semibold';
                            } else if (selectedOpt === oIdx && !isCorrect) {
                              optStyle = 'bg-error-bg border-error text-error';
                            }
                          } else if (selectedOpt === oIdx) {
                            optStyle = 'bg-brand-mint border-brand text-brand-dark';
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
                              {graded && oIdx === graded.correctIndex && (
                                <CheckCircle2 className="w-4 h-4 text-brand" />
                              )}
                              {graded && selectedOpt === oIdx && !isCorrect && (
                                <XCircle className="w-4 h-4 text-error" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation — arrives from the server only after grading */}
                      {graded && (
                        <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs space-y-1">
                          <div className="font-semibold text-brand flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Textbook Explanation ({q.section}):</span>
                          </div>
                          <p className="text-navy-2">{graded.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Submit / Reset Actions */}
                <div className="flex flex-col gap-3 bg-surface border border-border p-4 rounded-xl">
                  {gradeError && (
                    <div className="text-xs text-navy bg-quiz-light border border-quiz-border rounded-lg px-3 py-2">
                      {gradeError}
                    </div>
                  )}
                  {!isQuizSubmitted ? (
                    <button
                      type="button"
                      onClick={submitQuiz}
                      disabled={Object.keys(selectedAnswers).length === 0 || isGrading}
                      className="px-6 py-2 bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer self-start"
                    >
                      {isGrading
                        ? 'Grading…'
                        : `Submit & Grade Quiz (${Object.keys(selectedAnswers).length}/${quizQuestions.length} answered)`}
                    </button>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="text-sm font-semibold">
                        Score:{' '}
                        <span className="text-brand">
                          {quizGrade?.score ?? 0} / {quizGrade?.total ?? quizQuestions.length} Correct
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAnswers({});
                          setIsQuizSubmitted(false);
                          loadQuiz(selectedChapter);
                        }}
                        className="px-4 py-2 bg-surface-2 hover:bg-border text-navy-2 text-xs font-medium rounded-lg transition"
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

            {/* Deliberate run only: /api/eval runs retrieval per question — slow, burns quota. */}
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

            {/* Detailed Per-Question Evaluation Table */}
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
        )}

        {/* TAB 4: SYLLABUS EXPLORER */}
        {activeTab === 'syllabus' && (
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

            {/* Chunks Directory Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {syllabusData?.chunks.map((chunk: any) => (
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
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-text-2">
          Sabaq AI MVP • Grounded in Pakistani Board (PCTB) Curricula • Safe Confidence Guardrail & Verifiable Citations
        </div>
      </footer>
    </div>
  );
}
