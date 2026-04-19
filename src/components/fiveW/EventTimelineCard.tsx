'use client';

import { useState, useMemo } from 'react';
import { makeRng } from '@/lib/rng';
import { fmtUsd } from '@/lib/fmt';

const ANNOTATIONS = [
  { d: 3,  type: 'cache',  title: 'Cache rules updated',    severity: 'good', detail: '-$8.40/day' },
  { d: 8,  type: 'model',  title: 'Switched to Sonnet',     severity: 'good', detail: '-31% cost' },
  { d: 14, type: 'zombie', title: 'Loop detected',          severity: 'bad',  detail: '+$12 wasted' },
  { d: 18, type: 'budget', title: 'Budget alert fired',     severity: 'warn', detail: '80% threshold' },
  { d: 22, type: 'edit',   title: 'System prompt refactor', severity: 'info', detail: '-18% input' },
  { d: 27, type: 'rule',   title: 'Routing rule added',     severity: 'good', detail: 'Haiku for short' },
] as const;

const SEV_COLOR = {
  good: '#7CA893',
  bad:  '#B86B6B',
  warn: '#C9966B',
  info: '#8A9297',
} as const;

type Sev = 'good' | 'bad' | 'warn' | 'info';

// SVG dimensions
const W = 560;
const H = 200;
const PAD = { top: 20, right: 16, bottom: 28, left: 48 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;

function buildCurve(data: number[]) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const n = data.length;

  const px = (i: number) => PAD.left + (i / (n - 1)) * CHART_W;
  const py = (v: number) => PAD.top + CHART_H - ((v - min) / range) * CHART_H;

  const linePts = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(2)},${py(v).toFixed(2)}`).join(' ');
  const areaPath = `${linePts} L${px(n - 1).toFixed(2)},${(PAD.top + CHART_H).toFixed(2)} L${PAD.left},${(PAD.top + CHART_H).toFixed(2)} Z`;

  return { linePts, areaPath, px, py, min, max };
}

export function EventTimelineCard() {
  const [selected, setSelected] = useState<number | null>(null);

  const data = useMemo(() => {
    const rng = makeRng(44);
    return Array.from({ length: 30 }, (_, i) => {
      const base = 20 + rng() * 40;
      // Add spikes at annotation days
      const spike = [14, 18].includes(i) ? rng() * 30 + 20 : 0;
      // Drops after cache/model events
      const drop = [3, 4, 5, 8, 9].includes(i) ? -(rng() * 15) : 0;
      return Math.max(8, base + spike + drop);
    });
  }, []);

  const { linePts, areaPath, px, py, min, max } = useMemo(() => buildCurve(data), [data]);

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
              key={i}
              x1={PAD.left} y1={py(v)}
              x2={PAD.left + CHART_W} y2={py(v)}
              stroke="var(--line)" strokeWidth="1" strokeDasharray="3,3"
            />
          ))}

          {/* Y axis labels */}
          {yTicks.map(({ v, label }) => (
            <text
              key={v}
              x={PAD.left - 6} y={py(v)}
              textAnchor="end" dominantBaseline="middle"
              fill="var(--graphite)" fontSize="9"
              fontFamily="'JetBrains Mono', monospace"
            >
              {label}
            </text>
          ))}

          {/* X axis day labels */}
          {[0, 7, 14, 21, 29].map(i => (
            <text
              key={i}
              x={px(i)} y={PAD.top + CHART_H + 14}
              textAnchor="middle"
              fill="var(--graphite)" fontSize="9"
              fontFamily="'JetBrains Mono', monospace"
            >
              d{i + 1}
            </text>
          ))}

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
                key={ann.d}
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
