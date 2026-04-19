'use client';

import { useState } from 'react';
import { fmtUsd } from '@/lib/fmt';

const POINTS = [
  { label: 'research_agent', cost: 14.2, quality: 96, model: 'opus',   col: '#9BC4CC', r: 8 },
  { label: 'inbox_triage',   cost: 1.8,  quality: 84, model: 'haiku',  col: '#4F7B83', r: 5 },
  { label: 'code_review',    cost: 8.4,  quality: 94, model: 'sonnet', col: '#6FA8B3', r: 7 },
  { label: 'trip_planning',  cost: 2.2,  quality: 91, model: 'gemini', col: '#C9B08A', r: 6 },
  { label: 'market_scan',    cost: 1.1,  quality: 78, model: 'grok',   col: '#B88A8A', r: 5 },
  { label: 'quick_edits',    cost: 0.4,  quality: 88, model: 'haiku',  col: '#4F7B83', r: 4 },
  { label: 'deep_research',  cost: 18.8, quality: 98, model: 'opus',   col: '#9BC4CC', r: 9 },
  { label: 'automation',     cost: 6.2,  quality: 72, model: 'grok',   col: '#B88A8A', r: 6 },
];

const MODELS_LEGEND = [
  { id: 'opus',   col: '#9BC4CC' },
  { id: 'sonnet', col: '#6FA8B3' },
  { id: 'haiku',  col: '#4F7B83' },
  { id: 'gemini', col: '#C9B08A' },
  { id: 'grok',   col: '#B88A8A' },
];

// axis ranges
const COST_MIN = 0;
const COST_MAX = 20;
const QUAL_MIN = 60;
const QUAL_MAX = 100;

// SVG draw area (inside padded axes)
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 36;
const W = 400;
const H = 280;
const DW = W - PAD_L - PAD_R;
const DH = H - PAD_T - PAD_B;

function toSvgX(cost: number) {
  return PAD_L + ((cost - COST_MIN) / (COST_MAX - COST_MIN)) * DW;
}
function toSvgY(quality: number) {
  return PAD_T + (1 - (quality - QUAL_MIN) / (QUAL_MAX - QUAL_MIN)) * DH;
}

const X_TICKS = [0, 5, 10, 15, 20];
const Y_TICKS = [60, 70, 80, 90, 100];

interface Tooltip {
  label: string;
  model: string;
  cost: number;
  quality: number;
  x: number;
  y: number;
}

export function QualityCostScatter() {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="label" style={{ marginBottom: 14 }}>
        Quality x Cost · Efficiency frontier
      </div>

      <div style={{ position: 'relative' }}>
        <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
          {/* grid lines */}
          {X_TICKS.map(v => (
            <line key={`gx-${v}`}
              x1={toSvgX(v)} y1={PAD_T}
              x2={toSvgX(v)} y2={PAD_T + DH}
              stroke="var(--line)" strokeWidth="1"
            />
          ))}
          {Y_TICKS.map(v => (
            <line key={`gy-${v}`}
              x1={PAD_L} y1={toSvgY(v)}
              x2={PAD_L + DW} y2={toSvgY(v)}
              stroke="var(--line)" strokeWidth="1"
            />
          ))}

          {/* axis labels */}
          {X_TICKS.map(v => (
            <text key={`lx-${v}`}
              x={toSvgX(v)} y={PAD_T + DH + 16}
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="9"
              fill="var(--graphite)"
            >
              ${v}
            </text>
          ))}
          {Y_TICKS.map(v => (
            <text key={`ly-${v}`}
              x={PAD_L - 6} y={toSvgY(v) + 4}
              textAnchor="end"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="9"
              fill="var(--graphite)"
            >
              {v}
            </text>
          ))}

          {/* axis labels */}
          <text x={PAD_L + DW / 2} y={H - 2} textAnchor="middle" fontFamily="'Space Grotesk'" fontSize="9" letterSpacing=".12em" fill="var(--steel)">COST (USD)</text>
          <text
            x={10} y={PAD_T + DH / 2}
            textAnchor="middle"
            fontFamily="'Space Grotesk'" fontSize="9" letterSpacing=".12em" fill="var(--steel)"
            transform={`rotate(-90, 10, ${PAD_T + DH / 2})`}
          >QUALITY</text>

          {/* efficiency frontier - dashed diagonal */}
          <line
            x1={toSvgX(COST_MIN)} y1={toSvgY(QUAL_MIN + 5)}
            x2={toSvgX(COST_MAX - 1)} y2={toSvgY(QUAL_MAX - 2)}
            stroke="rgba(111,168,179,.3)" strokeWidth="1" strokeDasharray="5 4"
          />

          {/* data points */}
          {POINTS.map(p => {
            const cx = toSvgX(p.cost);
            const cy = toSvgY(p.quality);
            return (
              <circle
                key={p.label}
                cx={cx} cy={cy} r={p.r}
                fill={p.col}
                fillOpacity="0.75"
                stroke={p.col}
                strokeWidth="1.5"
                strokeOpacity="0.9"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setTooltip({ label: p.label, model: p.model, cost: p.cost, quality: p.quality, x: cx, y: cy })}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>

        {/* tooltip */}
        {tooltip && (
          <div className="tt" style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            pointerEvents: 'none',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--mist)', marginBottom: 4 }}>{tooltip.label}</div>
            <div style={{ color: 'var(--steel)', fontSize: 10 }}>model: <span className="mono" style={{ color: 'var(--fog)' }}>{tooltip.model}</span></div>
            <div style={{ color: 'var(--steel)', fontSize: 10 }}>cost: <span className="mono" style={{ color: 'var(--warn)' }}>{fmtUsd(tooltip.cost)}</span></div>
            <div style={{ color: 'var(--steel)', fontSize: 10 }}>quality: <span className="mono" style={{ color: 'var(--good)' }}>{tooltip.quality}</span></div>
          </div>
        )}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        {MODELS_LEGEND.map(m => (
          <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--steel)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.col, display: 'inline-block' }} />
            {m.id}
          </span>
        ))}
      </div>
    </div>
  );
}
