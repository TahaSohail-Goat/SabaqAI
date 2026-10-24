'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Beaker, BookOpen, Check, ChevronRight, FlaskConical, GitCompareArrows, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { useScope } from '@/components/app/ScopeContext';
import type { Citation, LabBootstrap, LabGuidance, LabInput, LabParameterKey, LabResponse, LabResult, LabRun, LabUnit } from '@/lib/types';
import { changedParameters, normalizeInput, settingsAsInput, solve, suggestedInput, toSI } from '@/lib/lab/engine';
import { defaultGuidance, explanationBlocks, predictionFeedback, comparisonTeaching } from '@/lib/lab/guidance';
import { EVIDENCE_PINS } from '@/lib/lab/evidence-pins';
import { EXPERIMENTS, experimentById, formatValue, OPENSTAX_URL, RESULT_LABELS } from '@/lib/lab/registry';
import { MotionGraph, MotionScene, visualButton } from './LabVisuals';
import styles from './lab.module.css';

const Reader = dynamic(() => import('@/components/app/AskDocumentReader'), { ssr: false, loading: () => <p className="p-6 text-sm text-text-2">Loading the original textbook…</p> });
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45';
const inputClass = 'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-50';
const neutral = 'rounded-xl border border-border bg-surface-muted p-4 text-sm leading-relaxed text-navy-2';
const newId = () => crypto.randomUUID();

export default function ConceptLab() {
  const { user, profile, board, classLevel } = useScope();
  const [bootstrap, setBootstrap] = useState<LabBootstrap | null>(null), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('');
  const [input, setInput] = useState<LabInput>(() => suggestedInput('uniform'));
  const [question, setQuestion] = useState(''), [questionNote, setQuestionNote] = useState('');
  const [suggested, setSuggested] = useState<LabParameterKey[]>(['x0', 'u', 'duration']);
  const [prediction, setPrediction] = useState(''), [reasoning, setReasoning] = useState(''), [exploration, setExploration] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [runs, setRuns] = useState<LabRun[]>([]), [activeRun, setActiveRun] = useState<LabRun | null>(null), [baseline, setBaseline] = useState<LabRun | null>(null);
  const [compareKey, setCompareKey] = useState<LabParameterKey>('u'), [comparing, setComparing] = useState(false);
  const [guidance, setGuidance] = useState<LabGuidance | null>(null), [busy, setBusy] = useState<'propose' | 'run' | 'explain' | null>(null), [error, setError] = useState('');
  const [pendingResult, setPendingResult] = useState<LabResult | null>(null), [citation, setCitation] = useState<Citation | null>(null);
  const [retryAction, setRetryAction] = useState<'propose' | 'run' | 'explain' | null>(null);
  const version = useRef(''), request = useRef<AbortController | null>(null), generation = useRef(0), inflight = useRef(false);
  const uncertainRequest = useRef<{ fingerprint: string; body: Record<string, unknown>; issuedAt: number } | null>(null);
  const readerClose = useRef<HTMLButtonElement | null>(null), readerTrigger = useRef<HTMLElement | null>(null);
  const definition = experimentById(input.experimentId);
  const enabledScope = Boolean(user && profile?.board === 'FBISE' && profile.classLevel === 9 && profile.subjects.includes('physics'));

  const cancel = useCallback(() => {
    generation.current++; request.current?.abort(); request.current = null; inflight.current = false; uncertainRequest.current = null;
    setBusy(null); setPendingResult(null);
  }, []);
  const invalidate = () => { cancel(); version.current = newId(); setConfirmed(false); setError(''); setRetryAction(null); setPrediction(''); };
  const load = useCallback(async () => {
    cancel(); const stamp = generation.current;
    setLoading(true); setLoadError(''); setBootstrap(null); setRuns([]); setActiveRun(null); setBaseline(null); setComparing(false); setGuidance(null); setCitation(null);
    setInput(suggestedInput('uniform')); setSuggested(['x0', 'u', 'duration']); setQuestion(''); setQuestionNote('');
    setPrediction(''); setReasoning(''); setConfirmed(false); setExploration(false); setCompareKey('u'); setError(''); setRetryAction(null);
    version.current = newId();
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/lab', { signal: controller.signal, cache: 'no-store' });
      const data = await response.json() as LabBootstrap | { message: string };
      if (!response.ok || !('sessionToken' in data)) throw new Error('message' in data ? data.message : 'Concept Lab could not start.');
      if (generation.current === stamp) setBootstrap(data);
    } catch (failure) {
      if (generation.current === stamp && !controller.signal.aborted) setLoadError(failure instanceof Error ? failure.message : 'The lab could not connect. Try again.');
    } finally { if (generation.current === stamp) setLoading(false); }
  }, [cancel]);
  useEffect(() => { if (enabledScope) void load(); else { cancel(); setLoading(false); setBootstrap(null); setRuns([]); setActiveRun(null); setBaseline(null); setGuidance(null); } return cancel; }, [enabledScope, user?.id, board, classLevel, load, cancel]);
  useEffect(() => {
    if (!citation) return;
    const previous = document.activeElement as HTMLElement | null; readerTrigger.current = previous;
    readerClose.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setCitation(null); };
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('keydown', closeOnEscape); readerTrigger.current?.focus(); };
  }, [citation]);

  const send = async (action: 'propose' | 'run' | 'explain', fields: Record<string, unknown>): Promise<LabResponse | null> => {
    if (!bootstrap || inflight.current) return null;
    const stamp = generation.current, inputVersion = version.current;
    inflight.current = true; setBusy(action); setError(''); setRetryAction(null);
    const controller = new AbortController(); request.current = controller;
    const fingerprint = JSON.stringify({ action, inputVersion, fields, sessionId: bootstrap.sessionId });
    const previous = uncertainRequest.current;
    const issuedAt = Date.now();
    const body = previous?.fingerprint === fingerprint && issuedAt - previous.issuedAt < 85000 ? previous.body
      : { action, sessionToken: bootstrap.sessionToken, requestId: newId(), inputVersion, issuedAt, ...fields };
    let received = false;
    try {
      const response = await fetch('/api/lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify(body) });
      received = true; uncertainRequest.current = null;
      const data = await response.json() as LabResponse;
      if (generation.current !== stamp || version.current !== inputVersion || controller.signal.aborted) return null;
      if (!response.ok || data.status === 'error') throw new Error('message' in data ? data.message : 'The lab request could not finish.');
      if (!('inputVersion' in data) || data.inputVersion !== inputVersion) return null;
      return data;
    } catch (failure) {
      if (!received && !controller.signal.aborted && generation.current === stamp) uncertainRequest.current = { fingerprint, body, issuedAt: Number(body.issuedAt) };
      if (!controller.signal.aborted && generation.current === stamp) { setError(failure instanceof Error ? failure.message : 'Connection lost. Check the local stack and retry.'); setRetryAction(action); }
      return null;
    } finally { if (generation.current === stamp) { inflight.current = false; setBusy(null); } }
  };
  const chooseExperiment = (id: LabInput['experimentId']) => {
    invalidate(); setInput(suggestedInput(id)); setSuggested(experimentById(id).parameters.map((p) => p.key));
    setReasoning(''); setActiveRun(null); setBaseline(null); setComparing(false); setGuidance(null); setQuestion(''); setQuestionNote('');
  };
  const propose = async () => {
    if (!question.trim() || inflight.current) return;
    setQuestionNote('');
    const response = await send('propose', { question });
    if (!response) return;
    if (response.status === 'proposal') {
      setInput(response.input); setSuggested(response.suggestedKeys); setConfirmed(false); setPrediction(''); setReasoning('');
      setBaseline(null); setComparing(false); setActiveRun(null); setGuidance(null);
      setQuestionNote('Experiment proposed. Check every setting below; values marked “suggested” were not supplied in your question.');
    } else if ('message' in response) setQuestionNote(response.message);
  };
  const explain = async (run: LabRun, base: LabRun | null) => {
    const response = await send('explain', { runToken: run.token, compareToken: base?.token ?? null });
    if (response?.status === 'feedback' && response.runId === run.id) setGuidance(response.guidance);
  };
  let validation = '';
  try { const normalized = normalizeInput(input); if (comparing && baseline && changedParameters(baseline.result.settings, normalized).length !== 1) validation = 'Change exactly one setting from Run A.'; }
  catch (failure) { validation = failure instanceof Error && !failure.message.startsWith('[') ? failure.message : 'Enter a finite value in each field.'; }
  const predictionValid = prediction.trim() !== '' && Number.isFinite(Number(prediction)) && Math.abs(Number(prediction)) <= 100000;
  const commitRun = async () => {
    if (validation || !confirmed || (!exploration && !predictionValid) || busy) return;
    setPendingResult(solve(input));
    const inputVersion = version.current;
    const base = comparing ? baseline : null;
    const response = await send('run', { confirmed: true, input, prediction: exploration ? null : Number(prediction), mode: exploration ? 'exploration' : 'guided', reasoning, question, baseRunToken: base?.token ?? null });
    if (version.current !== inputVersion) return;
    setPendingResult(null);
    if (response?.status !== 'run') return;
    setActiveRun(response.run); setRuns((previous) => [...previous, response.run].slice(-12)); setGuidance(defaultGuidance(response.run));
    if (window.innerWidth < 1280) requestAnimationFrame(() => document.querySelector('[aria-label="Motion experiment"]')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
    void explain(response.run, base);
  };
  const startComparison = (parameter?: LabParameterKey) => {
    if (!activeRun) return;
    invalidate(); setBaseline(activeRun); setComparing(true); setInput(settingsAsInput(activeRun.result.settings));
    setCompareKey(parameter ?? experimentById(activeRun.result.settings.experimentId).followups[0].parameter);
    setSuggested([]); setReasoning(''); setQuestionNote('Run A is kept unchanged. Change the highlighted setting, then predict Run B.');
  };
  const updateQuantity = (key: LabParameterKey, value: number, unit?: LabUnit) => {
    invalidate(); setSuggested((keys) => keys.filter((entry) => entry !== key));
    setInput((current) => ({ ...current, parameters: { ...current.parameters, [key]: { value, unit: unit ?? current.parameters[key]!.unit } } }));
  };
  const displayResult = pendingResult ?? activeRun?.result ?? null;
  const comparisonBase = activeRun && baseline && activeRun.id !== baseline.id && comparing ? baseline : undefined;
  const feedback = activeRun ? guidance ?? defaultGuidance(activeRun) : null;
  const blockText = activeRun ? explanationBlocks(activeRun.result) : {};
  const sourceKeys = new Set(definition.evidenceKeys);
  const evidenceCitations = bootstrap?.evidence.citations.filter((c) => EVIDENCE_PINS.some((pin) => pin.id === c.chunkId && sourceKeys.has(pin.key))) ?? [];
  const canRun = Boolean(bootstrap?.evidence.available[input.experimentId] && confirmed && !validation && (exploration || predictionValid) && !busy);

  return <div className={`${styles.lab} mx-auto w-full max-w-[1480px] space-y-6 pb-12`}>
    <p className="sr-only" aria-live="polite">{activeRun ? `Experiment complete. Distance ${formatValue(activeRun.result.distance)} metres; displacement ${formatValue(activeRun.result.displacement)} metres.` : ''}</p>
    <section className="relative overflow-hidden rounded-[24px] border border-border bg-surface p-6 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-64 w-64 rounded-full border-[35px] border-brand/5" />
      <div className="relative flex flex-wrap items-start justify-between gap-4"><div>
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-brand"><FlaskConical size={15} />Physics · Class 9 · Chapter 02</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-navy sm:text-4xl">A little curiosity.<br /><span className="text-brand">A world in motion.</span></h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-text-2">Predict what happens. Put it to the test. Make sense of the difference.<br className="hidden sm:block" /> Your Kinematics lab, grounded in the chapter you study.</p>
      </div><div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-xs leading-6 text-text-2"><span className="block font-semibold text-navy">Temporary lab notebook</span>Runs stay in this tab, up to 2 hours.<br />Reloading starts a new notebook.</div></div>
      <ol className="relative mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-xs font-semibold text-text-2">{['Predict', 'Experiment', 'Explain', 'Compare'].map((step, i) => <li key={step} className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand">{i + 1}</span>{step}{i < 3 && <ChevronRight size={13} className="ml-1 opacity-40" />}</li>)}</ol>
    </section>

    {!enabledScope ? <section className={neutral}><h2 className="font-semibold text-navy">Your curriculum comes first</h2><p className="mt-2">This release covers FBISE Class 9 Physics, Chapter 2. {user ? 'Choose that curriculum in Settings to use this lab.' : 'Sign in with an enrolled student account to begin.'}</p><Link href={user ? '/settings' : '/login'} className={`${primary} mt-4`}>{user ? 'Open Settings' : 'Sign in'}<ArrowRight size={15} /></Link></section>
      : loading ? <div className={`${neutral} flex items-center gap-3`} role="status"><LoaderCircle className="animate-spin" size={18} />Opening your notebook and checking the chapter sources…</div>
        : loadError ? <div className={neutral} role="status"><p>{loadError}</p><button className={`${visualButton} mt-3`} onClick={() => void load()}>Retry connection</button></div>
          : bootstrap && <>
      <section aria-label="Experiment catalogue"><div className="mb-3 flex items-baseline justify-between gap-2"><h2 className="font-display text-xl font-semibold text-navy">Choose your investigation</h2><p className="text-xs text-text-2">Three ways to explore Kinematics</p></div>
        <div className="grid gap-3 md:grid-cols-3">{EXPERIMENTS.map((experiment, index) => {
          const selected = input.experimentId === experiment.id, available = bootstrap.evidence.available[experiment.id];
          return <button key={experiment.id} onClick={() => chooseExperiment(experiment.id)} disabled={!available} aria-pressed={selected}
            className={`group relative rounded-2xl border p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${selected ? 'border-brand bg-surface shadow-[inset_0_0_0_1px_var(--color-brand)]' : 'border-border bg-surface/75 hover:border-brand hover:bg-surface'}`}>
            <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-text-2">{experiment.eyebrow}</span><span className={`flex h-7 w-7 items-center justify-center rounded-full ${selected ? 'bg-brand text-white' : 'bg-surface-muted text-text-2'}`}>{selected ? <Check size={14} /> : <ArrowUpRight size={14} />}</span></div>
            <svg aria-hidden="true" viewBox="0 0 120 38" className="my-3 h-9 w-28 text-brand"><path d={index === 0 ? 'M2 34L115 4' : index === 1 ? 'M2 34Q80 34 115 4' : 'M2 34L58 4L115 34'} stroke="currentColor" strokeWidth="2.5" fill="none" /><path d="M2 0V36H118" stroke="currentColor" strokeWidth=".6" fill="none" opacity=".3" /></svg>
            <h3 className="font-display text-lg font-semibold text-navy">{experiment.title}</h3><p className="mt-1.5 text-xs leading-5 text-text-2">{available ? experiment.description : bootstrap.evidence.reasons[experiment.id]}</p>
          </button>;
        })}</div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5" aria-label="AI experiment entry"><form onSubmit={(event) => { event.preventDefault(); void propose(); }}>
        <label htmlFor="lab-question" className="flex items-center gap-2 text-sm font-semibold text-navy"><Sparkles size={16} className="text-brand" />Start with a question</label>
        <p className="mt-1 text-xs leading-5 text-text-2">Ask about a supported motion. AI can suggest an experiment; you confirm all settings.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input id="lab-question" value={question} maxLength={800} onChange={(e) => { invalidate(); setQuestion(e.target.value); setQuestionNote(''); }} placeholder="What happens if a cart moves at 4 m/s for 5 seconds?" className={`${inputClass} flex-1`} /><button className={`${primary} shrink-0`} disabled={!question.trim() || Boolean(busy)}>{busy === 'propose' ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}Find an experiment</button></div>
      </form>{questionNote && <p role="status" className="mt-3 rounded-lg bg-surface-muted p-3 text-sm leading-6 text-navy-2">{questionNote}</p>}</section>

      {error && <div role="status" className={`${neutral} flex flex-wrap items-center justify-between gap-3`}><span>{error}</span>{retryAction && <button className={visualButton} onClick={() => { if (retryAction === 'propose') void propose(); else if (retryAction === 'run') void commitRun(); else if (activeRun) void explain(activeRun, comparisonBase ?? null); }}>Retry {retryAction === 'explain' ? 'guidance' : retryAction === 'propose' ? 'question' : 'run'}</button>}</div>}

      <div className="grid items-start gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-border bg-surface p-5" aria-label="Experiment settings">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-brand">01 / Set the conditions</p><h2 className="mt-1 font-display text-xl font-semibold text-navy">{comparing ? 'Change one thing' : 'Your experiment'}</h2>
            <p className="mt-2 text-xs leading-5 text-text-2">{comparing ? 'Run A stays unchanged. Only the chosen variable is editable for Run B.' : 'These are suggested settings. Edit them, then confirm before running.'}</p>
            {comparing && <label className="mt-4 block text-xs font-semibold text-navy">Variable to change<select value={compareKey} className={`${inputClass} mt-1`} onChange={(e) => { invalidate(); setCompareKey(e.target.value as LabParameterKey); if (baseline) setInput(settingsAsInput(baseline.result.settings)); }}>{definition.parameters.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>}
            <div className="mt-5 space-y-5">{definition.parameters.map((parameter) => {
              const quantity = input.parameters[parameter.key]!;
              const disabled = comparing && compareKey !== parameter.key;
              const factor = toSI(1, quantity.unit, parameter.units), step = parameter.step / factor;
              return <div key={parameter.key} className={comparing && !disabled ? 'rounded-xl bg-brand/5 p-3 -mx-3' : ''}>
                <div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor={`lab-${parameter.key}`} className="text-xs font-semibold text-navy">{parameter.label}</label>{suggested.includes(parameter.key) && <span className="text-[10px] font-medium text-text-2">suggested</span>}{disabled && <span className="text-[10px] text-text-2">held fixed</span>}</div>
                <div className="flex gap-2"><input id={`lab-${parameter.key}`} type="number" step="any" min={parameter.min / factor} max={parameter.max / factor} value={Number.isFinite(quantity.value) ? quantity.value : ''} disabled={disabled} onChange={(event) => updateQuantity(parameter.key, event.target.value === '' ? NaN : Number(event.target.value))} className={`${inputClass} min-w-0 flex-1 tabular-nums`} />
                  {parameter.units.length > 1 ? <select aria-label={`${parameter.label} unit`} disabled={disabled} value={quantity.unit} className={`${inputClass} max-w-24 shrink-0`} onChange={(event) => { const si = Number.isFinite(quantity.value) ? toSI(quantity.value, quantity.unit, parameter.units) : 0; updateQuantity(parameter.key, si / toSI(1, event.target.value, parameter.units), event.target.value as LabUnit); }}>{parameter.units.map((unit) => <option key={unit}>{unit}</option>)}</select> : <span className="flex w-20 items-center justify-center rounded-xl border border-border bg-surface-muted text-xs text-text-2">{parameter.unit}</span>}</div>
                <input aria-label={`${parameter.label} slider`} type="range" disabled={disabled} min={parameter.min / factor} max={parameter.max / factor} step={step} value={Number.isFinite(quantity.value) ? quantity.value : parameter.min / factor} onChange={(event) => updateQuantity(parameter.key, Number(event.target.value))} className="mt-2 h-2 w-full accent-brand disabled:opacity-35" />
                <div className="mt-1 flex justify-between text-[10px] text-text-2"><span>{formatValue(parameter.min / factor)} {quantity.unit}</span><span>{formatValue(parameter.max / factor)} {quantity.unit}</span></div>
              </div>;
            })}</div>
            {validation && <p className="mt-3 text-xs leading-5 text-navy-2" role="status">{validation}</p>}
            <details className="mt-5 rounded-xl bg-surface-muted px-3 py-3"><summary className="cursor-pointer text-xs font-semibold text-navy">Model assumptions & equations</summary><ul className="mt-3 space-y-2 text-xs leading-5 text-text-2">{definition.assumptions.map((text) => <li key={text}>{text}</li>)}</ul><div className="mt-3 space-y-1 border-t border-border pt-3">{definition.equations.map((equation) => <p className="text-xs leading-5 text-navy" key={equation}>{equation}</p>)}</div><p className="mt-3 text-[11px] leading-5 text-text-2">Bounds are conservative lab settings, not textbook limits. Full precision is used in calculations; the display rounds to three decimals.</p></details>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-navy"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 accent-brand" />I confirm these settings and the model assumptions.</label>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5" aria-label="Prediction">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-brand">02 / Think before you test</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-navy">Make your prediction</h2>
            <label className="mt-3 flex items-center gap-2 text-xs text-text-2"><input type="checkbox" checked={exploration} onChange={(e) => { invalidate(); setExploration(e.target.checked); }} className="accent-brand" />Exploration mode · run without a prediction</label>
            {!exploration && <><label htmlFor="lab-prediction" className="mt-4 block text-xs font-semibold leading-5 text-navy">{definition.prediction.prompt}</label><div className="mt-2 flex items-center gap-2"><input id="lab-prediction" type="number" step="any" min="-100000" max="100000" value={prediction} onChange={(e) => { cancel(); setPrediction(e.target.value); }} placeholder="Your estimate" className={inputClass} /><span className="shrink-0 text-sm text-text-2">{definition.prediction.unit}</span></div></>}
            <label htmlFor="lab-reasoning" className="mt-4 block text-xs font-semibold text-navy">{exploration ? 'What are you curious about?' : 'Why do you think so?'} <span className="font-normal text-text-2">(optional)</span></label><textarea id="lab-reasoning" rows={2} maxLength={600} value={reasoning} onChange={(e) => { cancel(); setReasoning(e.target.value); }} className={`${inputClass} mt-2 resize-y`} placeholder="A sentence or two is enough." />
            <button className={`${primary} mt-4 w-full`} disabled={!canRun} onClick={() => void commitRun()}>{busy === 'run' ? <LoaderCircle size={16} className="animate-spin" /> : <Beaker size={16} />}{comparing ? 'Run experiment B' : exploration ? 'Run exploration' : 'Test my prediction'}<ArrowRight size={15} /></button>
            <p className="mt-2 text-center text-[10px] leading-4 text-text-2">{busy === 'explain' ? 'Personalized guidance is loading. Your results are already available.' : !confirmed ? 'Confirm the settings above to continue.' : !exploration && !predictionValid ? 'Record a finite prediction to unlock your run.' : 'Results come from the equations, independent of AI.'}</p>
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <MotionScene result={displayResult} baseline={comparisonBase?.result} runKey={activeRun?.id ?? ''} pending={Boolean(pendingResult)} />
          <MotionGraph result={displayResult} baseline={comparisonBase?.result} />
          {activeRun && <>
            <section className="overflow-hidden rounded-2xl border border-border bg-surface p-5" aria-label="Calculated results"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-brand">03 / The calculation</p><h2 className="mt-1 font-display text-xl font-semibold text-navy">What actually happened</h2></div><span className="rounded-lg bg-surface-muted px-2 py-1 font-mono text-[10px] text-text-2" title={activeRun.id}>Run {activeRun.id.slice(0, 8)}</span></div>
              <table className="mt-4 w-full text-left text-xs" data-testid="lab-results"><caption className="sr-only">Code-calculated results in SI units. Run A and B use the same solver.</caption><thead><tr className="border-b border-border text-text-2"><th scope="col" className="pb-2 font-medium">Quantity</th><th scope="col" className="pb-2 text-right font-semibold" style={{ color: A_COLOR }}>Run A</th>{comparisonBase && <th scope="col" className="pb-2 text-right font-semibold" style={{ color: B_COLOR }}>Run B</th>}</tr></thead><tbody>{Object.entries(RESULT_LABELS).map(([key, meta]) => <tr key={key} className="border-b border-border/40 last:border-0"><th scope="row" className="py-2.5 font-medium text-navy-2">{meta.label}{' '}<span className="ml-1 text-[10px] font-normal text-text-2">({meta.unit})</span></th><td className="py-2.5 text-right font-semibold tabular-nums text-navy">{formatValue((comparisonBase ?? activeRun).result[key as keyof typeof RESULT_LABELS])}</td>{comparisonBase && <td className="py-2.5 text-right font-semibold tabular-nums text-navy">{formatValue(activeRun.result[key as keyof typeof RESULT_LABELS])}</td>}</tr>)}</tbody></table>
              {comparisonBase && <p className="mt-4 rounded-xl bg-surface-muted p-3 text-xs leading-6 text-navy-2">{comparisonTeaching(comparisonBase.result, activeRun.result)}</p>}
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5" aria-label="Explanation and feedback"><div className="flex items-center gap-2"><Sparkles size={17} className="text-brand" /><h2 className="font-display text-xl font-semibold text-navy">Make sense of it</h2>{busy === 'explain' && <LoaderCircle size={15} className="animate-spin text-brand" />}</div>
              <p className="mt-2 text-[11px] leading-5 text-text-2">{busy === 'explain' ? 'Reviewed explanation is ready. AI is choosing guidance for your question…' : feedback?.message}</p>
              {activeRun.question && <p className="mt-3 text-sm font-semibold leading-6 text-navy">Your question: {activeRun.question}</p>}
              <div className="mt-4 rounded-xl border border-border bg-brand/5 p-4"><p className="text-sm leading-6 text-navy">{predictionFeedback(activeRun)}</p>{activeRun.reasoning && <blockquote className="mt-3 border-l-2 border-brand/30 pl-3 text-xs italic leading-5 text-text-2">Your reasoning: “{activeRun.reasoning}”</blockquote>}</div>
              <div className="mt-4 space-y-3">{feedback?.blocks.map((id) => blockText[id] ? <p key={id} className="text-sm leading-7 text-navy-2">{blockText[id]}</p> : null)}</div>
              {feedback?.observations.map((observation, i) => { const observed = observation.runId === activeRun.id ? activeRun : comparisonBase; if (!observed) return null; const meta = RESULT_LABELS[observation.field]; return <p key={`${observation.runId}-${observation.field}-${i}`} className="mt-3 text-xs text-text-2"><span className="font-mono">Run {observed.id.slice(0, 8)}.{observation.field}</span> · {meta.label}: <strong className="text-navy">{formatValue(observed.result[observation.field])} {meta.unit}</strong></p>; })}
              <p className="mt-4 text-xs leading-5 text-text-2">This model tests the stated motion assumptions. It does not explain the forces causing the motion or establish mastery from one answer.</p>
              {!feedback?.personalized && !busy && <button disabled={version.current !== activeRun.inputVersion} className={`${visualButton} mt-3`} onClick={() => void explain(activeRun, comparisonBase ?? null)}>Retry AI guidance</button>}
              <div className="mt-5 border-t border-border pt-4"><p className="text-xs font-semibold text-navy">Test the relationship again</p><div className="mt-2 flex flex-wrap gap-2">{experimentById(activeRun.result.settings.experimentId).followups.map((f) => <button key={f.id} className={`${visualButton} text-xs ${feedback?.followupId === f.id ? 'border-brand' : ''}`} onClick={() => startComparison(f.parameter)}><GitCompareArrows size={14} />{f.label}</button>)}</div></div>
            </section>
          </>}

          <section className="rounded-2xl border border-border bg-surface p-5" aria-label="Textbook evidence"><div className="flex items-center gap-2"><BookOpen size={17} className="text-brand" /><h2 className="font-display text-lg font-semibold text-navy">Keep the textbook close</h2></div><p className="mt-2 text-xs leading-6 text-text-2">Textbook pages support the principles. Run IDs support calculated observations. Tap a reference to read the actual chapter.</p>
            <div className="mt-3 flex flex-wrap gap-2">{evidenceCitations.map((entry) => <button key={entry.chunkId} onClick={() => setCitation(entry)} className={`${visualButton} text-xs`}><BookOpen size={13} />Ch. {entry.chapterNo} · pp. {entry.pageFrom}–{entry.pageTo}<ArrowUpRight size={12} /></button>)}</div>
            <p className="mt-3 text-[11px] leading-5 text-text-2">The full constant-acceleration position equation was independently checked with <a href={OPENSTAX_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">OpenStax §2.5</a>. It is not presented as a quoted equation from this chapter.</p>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5" aria-label="Session summary"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-brand">04 / Your temporary notebook</p><h2 className="mt-1 font-display text-xl font-semibold text-navy">What you’ve tested</h2></div><div className="flex gap-2">{activeRun && <button className={visualButton} onClick={() => startComparison()}><GitCompareArrows size={15} />Compare a run</button>}<button className={visualButton} onClick={() => void load()}><RotateCcw size={14} />Restart lab</button></div></div>
        {!runs.length ? <p className="mt-3 text-sm text-text-2">Your notebook is empty. Pick an experiment and record your first prediction.</p> : <><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{runs.map((run, index) => <button key={run.id} onClick={() => { invalidate(); version.current = run.inputVersion; setActiveRun(run); setInput(settingsAsInput(run.result.settings)); setBaseline(null); setComparing(false); setSuggested([]); setGuidance(defaultGuidance(run)); setQuestion(run.question); setReasoning(run.reasoning); setPrediction(run.prediction === null ? '' : String(run.prediction)); setExploration(run.mode === 'exploration'); setQuestionNote('Viewing the original committed run. Confirm settings before creating another run.'); }} className={`rounded-xl border p-3 text-left transition hover:border-brand focus-visible:outline-2 focus-visible:outline-brand ${activeRun?.id === run.id ? 'border-brand bg-brand/5' : 'border-border bg-surface-muted/40'}`}><p className="text-xs font-semibold text-navy">{index + 1}. {experimentById(run.result.settings.experimentId).title}</p><p className="mt-1 text-[11px] leading-5 text-text-2">{run.mode === 'guided' ? 'Prediction recorded' : 'Exploration · no prediction'} · {formatValue(run.result.duration)} s<br />Distance {formatValue(run.result.distance)} m · displacement {formatValue(run.result.displacement)} m</p></button>)}</div><p className="mt-4 text-xs leading-6 text-text-2">The last {runs.length} run{runs.length === 1 ? '' : 's'} in this tab use ideal straight-line motion. {runs.some((run) => run.mode === 'guided') ? 'Compare your predictions with the calculations, then vary one condition to test your explanation.' : 'These runs are exploratory; no prediction was recorded.'} Real forces, air resistance, and motion outside these assumptions remain untested. Up to 12 runs are retained here; this is not durable learning history.</p></>}
      </section>
      <p className="text-center text-[11px] text-text-2">Kinematics · {bootstrap.evidence.version} · temporary session expires at {new Date(bootstrap.expiresAt).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' })} PKT</p>
    </>}

    {citation && bootstrap && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 sm:p-6" onClick={() => setCitation(null)}><section role="dialog" aria-modal="true" aria-labelledby="lab-source-heading" className="flex h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const items = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]');
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}><div className="flex items-center justify-between gap-3 border-b border-border p-4"><div><h2 id="lab-source-heading" className="text-sm font-semibold text-navy">Chapter {citation.chapterNo}: {citation.chapterTitle}</h2><p className="mt-1 text-xs text-text-2">Stored original-book pages {citation.pageFrom}–{citation.pageTo} · chapter PDF starts at book page {bootstrap.evidence.unit.pageFrom}</p></div><button ref={readerClose} className={visualButton} onClick={() => setCitation(null)} aria-label="Close textbook"><X size={18} /></button></div><div className="min-h-0 flex-1 overflow-auto"><Reader board="FBISE" classLevel={9} subject="physics" sourceType="textbook" unit={bootstrap.evidence.unit} activeCitation={citation} /></div></section></div>}
  </div>;
}
const A_COLOR = 'var(--lab-run-a, #9a5411)', B_COLOR = 'var(--lab-run-b, #2368b2)';
