'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack } from 'lucide-react';
import type { LabResult, LabSample } from '@/lib/types';
import { motionAt } from '@/lib/lab/engine';
import { formatValue } from '@/lib/lab/registry';

const A = 'var(--lab-run-a, #9a5411)', B = 'var(--lab-run-b, #2368b2)';
type GraphField = 'position' | 'distance' | 'velocity' | 'acceleration';
const graphMeta: Record<GraphField, { title: string; unit: string }> = {
  position: { title: 'Position', unit: 'm' }, distance: { title: 'Distance', unit: 'm' },
  velocity: { title: 'Velocity', unit: 'm/s' }, acceleration: { title: 'Acceleration', unit: 'm/s²' },
};
export const visualButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-navy transition hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40';

function useSvgWidth(padding = 0) {
  const ref = useRef<HTMLElement | null>(null), [width, setWidth] = useState(730);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width - padding)));
    observer.observe(ref.current); return () => observer.disconnect();
  }, [padding]);
  return { ref, width };
}

export function MotionScene({ result, baseline, runKey, pending = false }: { result: LabResult | null; baseline?: LabResult; runKey: string; pending?: boolean }) {
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const frame = useRef<number | null>(null), previous = useRef<number | null>(null);
  const { ref, width } = useSvgWidth();
  const total = Math.max(result?.duration ?? 5, baseline?.duration ?? 0);
  const rate = Math.max(1, total / 10);
  useEffect(() => {
    setTime(0); previous.current = null;
    setPlaying(Boolean(result) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // A new committed run resets replay; no settings/slider/provider coupling.
  }, [runKey, result]);
  useEffect(() => {
    const pause = () => { if (document.hidden) { setPlaying(false); previous.current = null; } };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  useEffect(() => {
    previous.current = null;
    if (!playing || !result) return;
    const tick = (now: number) => {
      if (document.hidden) { setPlaying(false); return; }
      const elapsed = previous.current === null ? 0 : Math.min((now - previous.current) / 1000, 0.1);
      previous.current = now;
      setTime((current) => {
        const next = Math.min(total, current + elapsed * rate);
        if (next >= total) setPlaying(false);
        return next;
      });
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); previous.current = null; };
  }, [playing, result, total, rate]);
  const points = [0, ...(result?.samples.map((p) => p.position) ?? [0, 20]), ...(baseline?.samples.map((p) => p.position) ?? [])];
  const lo = Math.min(...points), hi = Math.max(...points), span = Math.max(10, hi - lo);
  const min = lo - span * 0.1, max = Math.max(hi, lo + span) + span * 0.1;
  const x = (position: number) => 48 + (position - min) / (max - min) * (width - 80);
  const cart = (data: LabResult, y: number, label: string, color: string) => {
    const sample = motionAt(data.settings, time), cx = x(sample.position);
    return <g key={label}>
      <line x1={x(data.settings.parameters.x0)} y1={y + 15} x2={cx} y2={y + 15} stroke={color} strokeWidth="3" opacity=".4" />
      <g transform={`translate(${cx},${y})`}>
        <rect x="-19" y="-13" width="38" height="20" rx="6" fill={color} />
        <rect x="-10" y="-20" width="20" height="9" rx="3" fill={color} opacity=".65" />
        <circle cx="-11" cy="9" r="5" fill="currentColor" /><circle cx="11" cy="9" r="5" fill="currentColor" />
        <text x="0" y="1" textAnchor="middle" fill="var(--color-surface)" fontSize="11" fontWeight="700">{label}</text>
        {sample.velocity !== 0 && <path d={sample.velocity > 0 ? 'M26,-4 h20 m-5,-5 5,5 -5,5' : 'M-26,-4 h-20 m5,-5 -5,5 5,5'} fill="none" stroke={color} strokeWidth="2" />}
      </g>
      <text x="24" y={y + 38} fill="currentColor" fontSize="12">{label}: x = {formatValue(sample.position)} m · {time > data.duration ? 'finished' : `v = ${formatValue(sample.velocity)} m/s`}</text>
    </g>;
  };
  return <section ref={ref} className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Motion experiment">
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-text-2">The motion bench</p><h2 className="mt-1 font-display text-lg font-semibold text-navy">Watch the journey unfold</h2></div>
      <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-text-2">{pending ? 'Local preview · checking with server' : result ? 'Committed run · deterministic model' : 'Make a prediction to begin'}</span>
    </div>
    <svg role="img" aria-label={result ? 'Straight-line cart motion on a shared position scale. Right is positive. Both runs use the same simulation clock.' : 'Stationary cart on a straight track. Results appear after a run.'} viewBox={`0 0 ${width} 260`} className="mt-2 w-full text-navy">
      <defs><pattern id="lab-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth=".5" opacity=".08" /></pattern></defs>
      <rect width={width} height="260" fill="url(#lab-grid)" />
      <line x1="48" x2={width - 32} y1="208" y2="208" stroke="currentColor" opacity=".35" />
      <line x1={x(0)} x2={x(0)} y1="28" y2="215" stroke="currentColor" strokeDasharray="4 5" opacity=".2" />
      {Array.from({ length: width < 450 ? 3 : 5 }, (_, i) => { const value = min + (max - min) * i / (width < 450 ? 2 : 4); return <g key={i}><line x1={x(value)} x2={x(value)} y1="204" y2="213" stroke="currentColor" /><text x={x(value)} y="231" textAnchor="middle" fontSize="11" fill="currentColor">{formatValue(value)} m</text></g>; })}
      <text x={width - 32} y="251" textAnchor="end" fontSize="11" fill="currentColor">Position · right is positive →</text>
      {baseline && cart(baseline, 77, 'A', A)}
      {result ? cart(result, baseline ? 151 : 125, baseline ? 'B' : 'A', baseline ? B : A) : <g transform={`translate(${x(0)},125)`}><rect x="-19" y="-13" width="38" height="20" rx="6" fill={A} /><circle cx="-11" cy="9" r="5" fill="currentColor" /><circle cx="11" cy="9" r="5" fill="currentColor" /></g>}
    </svg>
    <div className="border-t border-border bg-surface-muted/40 px-5 py-4">
      <div className="flex items-center gap-3"><label htmlFor="lab-clock" className="shrink-0 text-xs font-semibold tabular-nums text-navy">{formatValue(time)} / {formatValue(total)} s</label><input id="lab-clock" aria-label="Simulation time" type="range" min="0" max={total} step={total / 500} value={time} disabled={!result} onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }} className="min-w-0 flex-1 accent-brand" /></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2"><button className={visualButton} disabled={!result} onClick={() => { if (time >= total) setTime(0); setPlaying(!playing); }} aria-label={playing ? 'Pause animation' : 'Play animation'}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : 'Play'}</button>
          <button className={visualButton} disabled={!result} onClick={() => { setTime(0); setPlaying(true); }}><RotateCcw size={14} />Replay</button>
          <button className={visualButton} disabled={!result} onClick={() => { setPlaying(false); setTime(0); }}><SkipBack size={14} />Reset</button></div>
        <p className="text-[11px] text-text-2">1 real second = {formatValue(rate)} simulation {rate === 1 ? 'second' : 'seconds'} · shared scale</p>
      </div>
      <p className="mt-2 text-[11px] text-text-2">Pauses when this tab is hidden. Scrub the clock to inspect motion without animation.</p>
    </div>
  </section>;
}

export function MotionGraph({ result, baseline }: { result: LabResult | null; baseline?: LabResult }) {
  const { ref, width } = useSvgWidth();
  const [field, setField] = useState<GraphField>('position');
  const allowed: GraphField[] = result?.settings.experimentId === 'journey' ? ['position', 'distance', 'velocity'] : ['position', 'distance', 'velocity', 'acceleration'];
  const current = allowed.includes(field) ? field : 'position', meta = graphMeta[current];
  const series = [baseline, result].filter((r): r is LabResult => Boolean(r));
  const values = series.flatMap((r) => r.samples.map((s) => s[current] ?? 0));
  const low = Math.min(0, ...values), high = Math.max(0, ...values), span = Math.max(1, high - low);
  const min = low - span * 0.12, max = (high === low ? low + 1 : high) + span * 0.12;
  const total = Math.max(1, ...series.map((r) => r.duration));
  const gx = (t: number) => 63 + t / total * (width - 85), gy = (y: number) => 204 - (y - min) / (max - min) * 162;
  const path = (r: LabResult) => {
    const points: LabSample[] = r.samples.flatMap((s) => current === 'velocity' && r.settings.experimentId === 'journey' && Math.abs(s.t - r.settings.parameters.duration) < 1e-9 ? [{ ...s, velocity: r.settings.parameters.u }, s] : [s]);
    return points.map((s, i) => `${i ? 'L' : 'M'}${gx(s.t)},${gy(s[current] ?? 0)}`).join(' ');
  };
  return <section ref={ref} className="rounded-2xl border border-border bg-surface p-5" aria-label="Motion graphs">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold text-navy">Read the motion</h2><div className="flex gap-3 text-xs font-semibold"><span style={{ color: A }}>━━ Run A</span>{baseline && <span style={{ color: B }}>┄┄ Run B</span>}</div></div>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Graph quantity">{allowed.map((key) => <button key={key} aria-pressed={current === key} onClick={() => setField(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-brand ${current === key ? 'bg-selected-surface text-selected-text' : 'bg-surface-muted text-navy-2 hover:bg-surface-hover'}`}>{graphMeta[key].title}</button>)}</div>
    {result ? <><svg role="img" aria-label={`${meta.title}–time graph. Vertical axis ${meta.unit}; horizontal axis seconds. Run A is a solid ochre line; Run B is a dashed blue line. Both share axes.`} viewBox={`0 0 ${width} 260`} className="mt-3 w-full text-navy">
      {[0, 1, 2, 3, 4].map((i) => { const y = low + (high - low || 1) * i / 4; return <g key={i}><line x1="63" x2={width - 22} y1={gy(y)} y2={gy(y)} stroke="currentColor" opacity=".1" /><text x="53" y={gy(y) + 4} textAnchor="end" fill="currentColor" fontSize="11">{formatValue(y)}</text></g>; })}
      {[0, 1, 2, 3, 4].map((i) => <g key={i}><line x1={gx(total * i / 4)} x2={gx(total * i / 4)} y1="34" y2="204" stroke="currentColor" opacity=".08" /><text x={gx(total * i / 4)} y="224" textAnchor="middle" fontSize="11" fill="currentColor">{formatValue(total * i / 4)}</text></g>)}
      <path d={`M63 30V204H${width - 15}`} fill="none" stroke="currentColor" opacity=".5" />
      <text x="4" y="19" fontSize="12" fill="currentColor">{meta.title} ({meta.unit})</text><text x={width - 22} y="250" textAnchor="end" fontSize="12" fill="currentColor">Time (s)</text>
      {baseline && <path d={path(baseline)} fill="none" stroke={A} strokeWidth="3" />}
      <path d={path(result)} fill="none" stroke={baseline ? B : A} strokeWidth="3" strokeDasharray={baseline ? '7 4' : undefined} />
      {series.map((r, i) => { const last = r.samples.at(-1)!; return <circle key={i} cx={gx(last.t)} cy={gy(last[current] ?? 0)} r="4" fill={i === 0 ? A : B} />; })}
    </svg><p className="text-xs leading-relaxed text-text-2">{current === 'distance' ? 'Distance counts the whole path and never decreases, even after a reversal.' : current === 'position' ? 'Position keeps its sign. The slope shows signed velocity.' : current === 'velocity' ? 'Velocity keeps direction. A crossing through zero may mark a turn.' : 'The horizontal line shows constant acceleration, including zero for uniform motion.'}{result.settings.experimentId === 'journey' && current === 'velocity' ? ' The vertical step is an idealized jump, not a simulated acceleration.' : ''} {baseline && 'Each curve stops at its own elapsed time; the axes stay shared.'}</p></>
      : <div className="my-5 flex h-44 items-center justify-center rounded-xl border border-dashed border-border bg-surface-muted/40 px-8 text-center text-sm text-text-2">Your graphs will appear here after you commit a run. First, make your prediction.</div>}
  </section>;
}
