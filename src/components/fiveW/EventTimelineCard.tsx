'use client';

import { useState, useMemo } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

type Sev = 'good' | 'bad' | 'warn' | 'info';

interface Annotation {
  d: number;
  type: string;
  title: string;
  severity: Sev;
  detail: string;
}


function normalizeSeverity(s: string): Sev {
  if (s === 'good' || s === 'bad' || s === 'warn' || s === 'info') return s;
  return 'info';
}

const SEV_COLOR = {
  good: '#7CA893',
  bad:  '#B86B6B',
  warn: '#C9966B',
  info: '#6FA8B3',
} as const;

// SVG dimensions
const W = 560;
const H = 200;
const PAD = { top: 20, right: 16, bottom: 28, left: 48 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;

function buildCurve(data: number[]) {
  const safeData = data.map(v => (isFinite(v) && !isNaN(v)) ? v : 0);
  const n = safeData.length;

  // Guard: empty data → return stubs so callers never receive NaN
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
  // -Infinity is truthy in JS, so use isFinite guard instead of || 1
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

interface EventTimelineProps {
  lookback?: Lookback;
  provider?: string;
}

export function EventTimelineCard({ lookback = '30D', provider }: EventTimelineProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const { data: timelineData } = trpc.events.timeline.useQuery({ lookback, provider });

  const data = useMemo<number[]>(() => {
    if (timelineData && timelineData.daily.length > 0) {
      return timelineData.daily.map(d => d.costUsd);
    }
    return [];
  }, [timelineData]);

  const ANNOTATIONS = useMemo<readonly Annotation[]>(() => {
    if (!timelineData || timelineData.annotations.length === 0 || timelineData.daily.length === 0) return [];

    // Build a map from ISO date prefix (YYYY-MM-DD) → index in daily array
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
        // Annotation date not in daily series — compute nearest index by ms offset
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

  if (!timelineData) return (
    <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
    </div>
  );

  if (!data.length) return (
    <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      <span style={{ fontSize: 12, color: 'var(--steel)' }}>No events in this window.</span>
    </div>
  );

  const selectedAnn = selected !== null ? ANNOTATIONS[selected] : null;

  // Y axis ticks
  const yTicks = [
    { v: min, label: fmtUsd(min) },
    { v: (min + max) / 2, label: fmtUsd((min + max) / 2) },
    { v: max, label: fmtUsd(max) },
  ];

  return (
    <div className="card">
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>Event Timeline</span>
        <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>Spend curve with causal markers</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {(['good', 'bad', 'warn', 'info'] as Sev[]).map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[s] }} />
              <span style={{ fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--steel)' }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: '12px 18px 0' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="etg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6FA8B3" stopOpacity=".22" />
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

          {/* X axis labels — 5 evenly-spaced ticks across the data range */}
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
                {/* Vertical dashed line */}
                <line
                  x1={x} y1={PAD.top}
                  x2={x} y2={y - 8}
                  stroke={color}
                  strokeWidth={isSelected ? 1.5 : 1}
                  strokeDasharray="3,2"
                  opacity={isSelected ? 1 : 0.6}
                />
                {/* Circle marker */}
                <circle
                  cx={x} cy={y}
                  r={isSelected ? 6 : 4}
                  fill={color}
                  opacity={isSelected ? 1 : 0.8}
                  stroke={isSelected ? 'var(--ink)' : 'none'}
                  strokeWidth="2"
                />
                {/* Label at top */}
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
      </div>

      {/* Detail card */}
      <div style={{
        margin: '0 18px 14px',
        minHeight: 52,
        borderRadius: 'var(--r)',
        background: selectedAnn ? 'rgba(255,255,255,.025)' : 'transparent',
        border: selectedAnn ? '1px solid var(--line-2)' : '1px solid transparent',
        padding: selectedAnn ? '10px 14px' : 0,
        transition: 'all .15s ease',
        overflow: 'hidden',
      }}>
        {selectedAnn && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 3, flexShrink: 0, alignSelf: 'stretch', borderRadius: 2,
              background: SEV_COLOR[selectedAnn.severity],
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mist)', marginBottom: 2 }}>
                {selectedAnn.title}
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 10, color: 'var(--steel)' }}>Day {selectedAnn.d + 1}</span>
                <span style={{ fontSize: 10, color: 'var(--steel)' }}>Type: {selectedAnn.type}</span>
              </div>
            </div>
            <div className="mono" style={{
              fontSize: 14, fontWeight: 700,
              color: SEV_COLOR[selectedAnn.severity],
              whiteSpace: 'nowrap',
            }}>
              {selectedAnn.detail}
            </div>
          </div>
        )}
        {!selectedAnn && (
          <div style={{ padding: '14px 0', fontSize: 10, color: 'var(--graphite)', textAlign: 'center' }}>
            Click a marker to see event detail
          </div>
        )}
      </div>
    </div>
  );
}
