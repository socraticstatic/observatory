'use client';

import { useState, useMemo } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const EVENTS = [
  {d:2,  type:'edit',   title:'Edit: research_agent system prompt',        detail:'1.2k → 3.8k tokens',      impact:'+212% cost/run', severity:'bad'},
  {d:5,  type:'model',  title:'Claude Opus 4.5 released',                  detail:'auto-upgrade opt-in',     impact:'+$4.20/day',     severity:'warn'},
  {d:8,  type:'cache',  title:'Cache cleared (full)',                       detail:'manual reset',            impact:'cache-hit → 11%', severity:'bad'},
  {d:11, type:'budget', title:'Monthly budget reset',                       detail:'$200 allotment',          impact:'cycle start',    severity:'info'},
  {d:14, type:'rule',   title:'Rule: auto-route debug.* → Sonnet',         detail:'cost guard activated',    impact:'-$2.80/day',     severity:'good'},
  {d:17, type:'edit',   title:'Edit: pricing_engine RAG retrieval',        detail:'k=12 → k=5',              impact:'-38% input tok', severity:'good'},
  {d:21, type:'zombie', title:'Loop detected: debug.session',              detail:'22 steps on 3-step task', impact:'$6.40 wasted',   severity:'bad'},
  {d:25, type:'model',  title:'Gemini 2.5 Flash added',                    detail:'routing candidate',       impact:'opportunity',    severity:'info'},
  {d:28, type:'edit',   title:'Edit: inbox_triage compressed',             detail:'few-shot 8 → 3 examples', impact:'-24% cost',      severity:'good'},
] as const;

type EventItem = typeof EVENTS[number];

const EVENT_GLYPHS: Record<string, string> = {
  edit:   '✎',
  model:  '✦',
  cache:  '⌫',
  budget: '◎',
  rule:   '▸',
  zombie: '☠',
};

const SEV_COLOR: Record<string, string> = {
  good: '#7CA893',
  warn: '#C9966B',
  bad:  '#B86B6B',
  info: '#6FA8B3',
};

const PAD = { top: 14, right: 8, bottom: 20, left: 40 };
const CHART_W = 600 - PAD.left - PAD.right;
const CHART_H = 80 - PAD.top - PAD.bottom;

type Annotation = {
  d: number;
  type: string;
  title: string;
  severity: 'good' | 'warn' | 'bad' | 'info';
  detail: string;
};

function normalizeSeverity(s: string): 'good' | 'warn' | 'bad' | 'info' {
  if (s === 'good' || s === 'warn' || s === 'bad' || s === 'info') return s as 'good' | 'warn' | 'bad' | 'info';
  if (s === 'critical' || s === 'error') return 'bad';
  if (s === 'warning') return 'warn';
  return 'info';
}

function buildCurve(data: number[]) {
  const safeData = data.map(v => (isFinite(v) && !isNaN(v)) ? v : 0);
  const n = safeData.length;

  if (n === 0) {
    const fallbackY = PAD.top + CHART_H;
    const fallbackX = PAD.left + CHART_W / 2;
    return {
      linePts: '',
      areaPath: '',
      px: (_i: number) => fallbackX,
      py: (_v: number) => fallbackY,
      min: 0,
      max: 0,
    };
  }

  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = isFinite(max - min) && (max - min) > 0 ? max - min : 1;

  const px = (i: number) => n <= 1 ? PAD.left + CHART_W / 2 : PAD.left + (i / (n - 1)) * CHART_W;
  const py = (v: number) => {
    const sv = (isFinite(v) && !isNaN(v)) ? v : 0;
    const result = PAD.top + CHART_H - ((sv - min) / range) * CHART_H;
    return isFinite(result) ? result : PAD.top + CHART_H;
  };

  const linePts = safeData.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(2)},${py(v).toFixed(2)}`).join(' ');
  const areaPath = `${linePts} L${px(n - 1).toFixed(2)},${(PAD.top + CHART_H).toFixed(2)} L${PAD.left},${(PAD.top + CHART_H).toFixed(2)} Z`;

  return { linePts, areaPath, px, py, min, max };
}

function getSevKey(severity: string): string {
  if (severity === 'good') return 'good';
  if (severity === 'info') return 'info';
  if (severity === 'warn') return 'warn';
  return 'bad';
}

interface EventTimelineProps {
  lookback?: Lookback;
  provider?: string;
}

export function EventTimelineCard({ lookback = '30D', provider }: EventTimelineProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [sel, setSel] = useState<EventItem>(EVENTS[5]);

  const { data: timelineData } = trpc.events.timeline.useQuery({ lookback, provider });

  const data = useMemo<number[]>(() => {
    if (timelineData && timelineData.daily.length > 0) {
      return timelineData.daily.map(d => d.costUsd);
    }
    return [];
  }, [timelineData]);

  const ANNOTATIONS = useMemo<readonly Annotation[]>(() => {
    if (!timelineData || timelineData.annotations.length === 0 || timelineData.daily.length === 0) return [];

    const dayIndexMap = new Map<string, number>();
    timelineData.daily.forEach((row, i) => {
      dayIndexMap.set(row.d.slice(0, 10), i);
    });

    const firstDayMs  = new Date(timelineData.daily[0].d).getTime();
    const msPerDay    = 86_400_000;
    const lastIdx     = timelineData.daily.length - 1;

    return timelineData.annotations.map(a => {
      const annDateKey = a.ts.slice(0, 10);
      let d = dayIndexMap.get(annDateKey);
      if (d === undefined) {
        const offsetDays = Math.round((new Date(a.ts).getTime() - firstDayMs) / msPerDay);
        d = Math.min(lastIdx, Math.max(0, offsetDays));
      }
      return {
        d,
        type: a.type,
        title: a.title,
        severity: normalizeSeverity(a.severity),
        detail: a.detail ?? '',
      };
    });
  }, [timelineData]);

  const { linePts, areaPath, px, py, min, max } = useMemo(() => buildCurve(data), [data]);

  // Use static events if no real data
  const useStatic = !timelineData || data.length === 0;

  const yTicks = useStatic ? [] : [
    { v: min, label: fmtUsd(min) },
    { v: (min + max) / 2, label: fmtUsd((min + max) / 2) },
    { v: max, label: fmtUsd(max) },
  ];

  const selectedAnn = selected !== null ? ANNOTATIONS[selected] : null;

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="label">WHEN · EVENT TIMELINE</div>
            <div style={{ fontSize: 13, color: 'var(--fog)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              what <em style={{ color: 'var(--mist)', fontStyle: 'normal' }}>changed</em> — annotated on spend
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {Object.entries(EVENT_GLYPHS).map(([k, g]) => {
              const sev = k === 'edit' ? 'warn' : k === 'cache' || k === 'zombie' ? 'bad' : k === 'rule' ? 'good' : 'info';
              return (
                <span
                  key={k}
                  title={k}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 5px',
                    border: '1px solid var(--line-2)',
                    borderRadius: 3,
                    background: 'rgba(255,255,255,.015)',
                    fontSize: 9,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: 'var(--fog)',
                  }}
                >
                  <span className="mono" style={{ color: SEV_COLOR[sev], fontSize: 10, lineHeight: 1 }}>{g}</span>
                  <span style={{ color: 'var(--steel)' }}>{k}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Spend curve with event pins */}
      <div style={{
        position: 'relative',
        height: 120,
        background: 'rgba(0,0,0,.25)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        padding: '8px 10px 22px',
      }}>
        {!useStatic ? (
          <svg
            viewBox="0 0 600 80"
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <defs>
              <linearGradient id="etg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6FA8B3" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#6FA8B3" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {yTicks.map(({ v }, i) => (
              <line
                key={`gl-${i}`}
                x1={PAD.left} y1={py(v)}
                x2={PAD.left + CHART_W} y2={py(v)}
                stroke="var(--line)" strokeWidth="1" strokeDasharray="3,3"
              />
            ))}

            {/* Y axis labels */}
            {yTicks.map(({ v, label }, i) => (
              <text
                key={`yl-${i}`}
                x={PAD.left - 6} y={py(v)}
                textAnchor="end" dominantBaseline="middle"
                fill="var(--graphite)" fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
              >
                {label}
              </text>
            ))}

            {/* X axis labels */}
            {data.length > 0 && (() => {
              const n = data.length;
              const ticks = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
              return ticks.map((i, tickIdx) => {
                const label = timelineData?.daily[i]
                  ? (lookback === '1H'
                      ? new Date(timelineData.daily[i].d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : lookback === '24H'
                      ? new Date(timelineData.daily[i].d).toLocaleTimeString([], { hour: '2-digit' })
                      : new Date(timelineData.daily[i].d).toLocaleDateString([], { month: 'short', day: 'numeric' }))
                  : '';
                return (
                  <text
                    key={`xtick-${tickIdx}`}
                    x={px(i)} y={PAD.top + CHART_H + 14}
                    textAnchor="middle"
                    fill="var(--graphite)" fontSize="9"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {label}
                  </text>
                );
              });
            })()}

            {/* Area fill */}
            <path d={areaPath} fill="url(#etg)" />

            {/* Line */}
            <path d={linePts} fill="none" stroke="#6FA8B3" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

            {/* Annotation pins */}
            {ANNOTATIONS.map((ann, i) => {
              const x = px(ann.d);
              const y = py(data[ann.d]);
              const color = SEV_COLOR[ann.severity];
              const isSelected = selected === i;

              return (
                <g
                  key={`ann-${i}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(isSelected ? null : i)}
                >
                  <line
                    x1={x} y1={PAD.top}
                    x2={x} y2={y - 8}
                    stroke={color}
                    strokeWidth={isSelected ? 1.5 : 1}
                    strokeDasharray="3,2"
                    opacity={isSelected ? 1 : 0.6}
                  />
                  <circle
                    cx={x} cy={y}
                    r={isSelected ? 6 : 4}
                    fill={color}
                    opacity={isSelected ? 1 : 0.8}
                    stroke={isSelected ? 'var(--ink)' : 'none'}
                    strokeWidth="2"
                  />
                  <text
                    x={x} y={PAD.top - 4}
                    textAnchor="middle"
                    fill={color}
                    fontSize="8"
                    fontFamily="'Space Grotesk', sans-serif"
                    letterSpacing=".06em"
                    opacity={isSelected ? 1 : 0.7}
                  >
                    {ann.type.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <>
            <svg
              viewBox="0 0 600 90"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="spendGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#6FA8B3" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#6FA8B3" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>

            {/* Event pins */}
            {EVENTS.map(ev => {
              const x = (ev.d / 29) * 100;
              const sev = getSevKey(ev.severity);
              const color = SEV_COLOR[sev];
              const isSel = sel && sel.d === ev.d;
              return (
                <div
                  key={ev.d}
                  onClick={() => setSel(ev)}
                  style={{
                    position: 'absolute',
                    left: `calc(${x}% + 10px)`,
                    top: `calc(50% - 4px)`,
                    transform: 'translate(-50%,-100%)',
                    cursor: 'pointer',
                    zIndex: isSel ? 3 : 2,
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      width: isSel ? 20 : 16,
                      height: isSel ? 20 : 16,
                      borderRadius: '50%',
                      background: '#11171B',
                      border: `1.5px solid ${color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: color,
                      fontSize: isSel ? 11 : 9,
                      fontFamily: 'JetBrains Mono',
                      fontWeight: 600,
                      boxShadow: isSel ? `0 0 0 3px ${color}33` : 'none',
                      transition: 'all 120ms',
                    }}>
                      {EVENT_GLYPHS[ev.type]}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Day labels */}
            <div style={{
              position: 'absolute',
              left: 10,
              right: 10,
              bottom: 4,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9,
              color: 'var(--graphite)',
              fontFamily: 'JetBrains Mono',
            }}>
              <span>-30d</span>
              <span>-20d</span>
              <span>-10d</span>
              <span>today</span>
            </div>
          </>
        )}
      </div>

      {/* Selected event detail — real data */}
      {!useStatic && selectedAnn && (
        <div style={{
          marginTop: 10,
          padding: '10px 12px',
          background: 'rgba(0,0,0,.2)',
          border: '1px solid var(--line)',
          borderLeft: `3px solid ${SEV_COLOR[selectedAnn.severity]}`,
          borderRadius: 'var(--r)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 2 }}>{selectedAnn.title}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{selectedAnn.detail}</div>
        </div>
      )}

      {/* Selected event detail — static */}
      {useStatic && sel && (() => {
        const sev = getSevKey(sel.severity);
        const color = SEV_COLOR[sev];
        return (
          <div style={{
            marginTop: 10,
            padding: '10px 12px',
            background: 'rgba(0,0,0,.2)',
            border: '1px solid var(--line)',
            borderLeft: `3px solid ${color}`,
            borderRadius: 'var(--r)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.1em' }}>
                D-{30 - sel.d}
              </span>
              <span className="mono" style={{ fontSize: 9, color: color, letterSpacing: '.14em', textTransform: 'uppercase' }}>
                {sel.type}
              </span>
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              <span className="mono" style={{
                fontSize: 11,
                color: sel.severity === 'good' ? 'var(--good)' : sel.severity === 'bad' ? 'var(--bad)' : 'var(--fog)',
              }}>
                {sel.impact}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 2 }}>{sel.title}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{sel.detail}</div>
          </div>
        );
      })()}

      {/* Footer */}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, fontSize: 10, color: 'var(--graphite)' }}>
        <span className="mono">
          {EVENTS.length} events · {EVENTS.filter(e => e.severity === 'bad').length} cost-negative · {EVENTS.filter(e => e.severity === 'good').length} cost-positive
        </span>
        <span style={{ flex: 1 }} />
        <button className="mbtn" style={{ padding: '3px 8px', fontSize: 9 }}>Add event</button>
      </div>
    </div>
  );
}
