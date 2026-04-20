'use client';

import { useState, useMemo } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';

const DEMO_POINTS = [
  { label: 'research_agent', costUsd: 14.2, quality: 96, model: 'claude-opus-4' },
  { label: 'inbox_triage',   costUsd: 1.8,  quality: 84, model: 'claude-haiku-4' },
  { label: 'code_review',    costUsd: 8.4,  quality: 94, model: 'claude-sonnet-4' },
  { label: 'trip_planning',  costUsd: 2.2,  quality: 91, model: 'gemini-2.0' },
  { label: 'market_scan',    costUsd: 1.1,  quality: 78, model: 'grok-3' },
  { label: 'quick_edits',    costUsd: 0.4,  quality: 88, model: 'claude-haiku-4' },
  { label: 'deep_research',  costUsd: 18.8, quality: 98, model: 'claude-opus-4' },
  { label: 'automation',     costUsd: 6.2,  quality: 72, model: 'grok-3' },
];

function modelColor(model: string): string {
  if (model.includes('opus'))   return '#9BC4CC';
  if (model.includes('sonnet')) return '#6FA8B3';
  if (model.includes('haiku'))  return '#4F7B83';
  if (model.includes('gemini')) return '#C9B08A';
  if (model.includes('grok'))   return '#B88A8A';
  return '#8A9297';
}

const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 36;
const W = 400;
const H = 280;
const DW = W - PAD_L - PAD_R;
const DH = H - PAD_T - PAD_B;

interface Pt { label: string; costUsd: number; quality: number; model: string }

interface Tooltip { label: string; model: string; cost: number; quality: number; x: number; y: number }

export function QualityCostScatter() {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const { data: raw } = trpc.costDrivers.qualityCostByProject.useQuery({ lookback: '24H' });

  const points = useMemo<Pt[]>(() => {
    if (raw && raw.length > 0 && raw.some(r => r.quality > 0)) return raw;
    return DEMO_POINTS;
  }, [raw]);

  const costMax = Math.max(...points.map(p => p.costUsd)) * 1.15;
  const costMin = 0;
  const qualMin = Math.max(0, Math.min(...points.map(p => p.quality)) - 8);
  const qualMax = Math.min(100, Math.max(...points.map(p => p.quality)) + 4);
  const maxCostForR = costMax;

  const costRange = costMax - costMin || 1;
  const qualRange = qualMax - qualMin || 1;

  function toX(cost: number) {
    return PAD_L + ((cost - costMin) / costRange) * DW;
  }
  function toY(quality: number) {
    return PAD_T + (1 - (quality - qualMin) / qualRange) * DH;
  }
  function toR(cost: number) {
    return 4 + (cost / Math.max(maxCostForR, 0.01)) * 5;
  }

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(t => costMin + t * (costMax - costMin));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => qualMin + t * (qualMax - qualMin));

  const usedModels = [...new Set(points.map(p => p.model))];

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="label" style={{ marginBottom: 14 }}>
        Quality × Cost · Efficiency frontier
      </div>

      <div style={{ position: 'relative' }}>
        <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
          {/* grid */}
          {xTicks.map((v, i) => (
            <line key={`gx-${i}`}
              x1={toX(v)} y1={PAD_T} x2={toX(v)} y2={PAD_T + DH}
              stroke="var(--line)" strokeWidth="1"
            />
          ))}
          {yTicks.map((v, i) => (
            <line key={`gy-${i}`}
              x1={PAD_L} y1={toY(v)} x2={PAD_L + DW} y2={toY(v)}
              stroke="var(--line)" strokeWidth="1"
            />
          ))}

          {/* axis tick labels */}
          {xTicks.map((v, i) => (
            <text key={`lx-${i}`}
              x={toX(v)} y={PAD_T + DH + 16}
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="var(--graphite)"
            >
              ${v.toFixed(v < 1 ? 2 : 0)}
            </text>
          ))}
          {yTicks.map((v, i) => (
            <text key={`ly-${i}`}
              x={PAD_L - 6} y={toY(v) + 4}
              textAnchor="end"
              fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="var(--graphite)"
            >
              {v.toFixed(0)}
            </text>
          ))}

          {/* axis labels */}
          <text x={PAD_L + DW / 2} y={H - 2} textAnchor="middle"
            fontFamily="'Space Grotesk'" fontSize="9" letterSpacing=".12em" fill="var(--steel)">
            COST (USD)
          </text>
          <text
            x={10} y={PAD_T + DH / 2} textAnchor="middle"
            fontFamily="'Space Grotesk'" fontSize="9" letterSpacing=".12em" fill="var(--steel)"
            transform={`rotate(-90, 10, ${PAD_T + DH / 2})`}
          >
            QUALITY
          </text>

          {/* efficiency frontier */}
          <line
            x1={toX(costMin)} y1={toY(qualMin + (qualMax - qualMin) * 0.05)}
            x2={toX(costMax * 0.9)} y2={toY(qualMax * 0.98)}
            stroke="rgba(111,168,179,.3)" strokeWidth="1" strokeDasharray="5 4"
          />

          {/* data points */}
          {points.map(p => {
            const cx = toX(p.costUsd);
            const cy = toY(p.quality);
            const r  = toR(p.costUsd);
            const col = modelColor(p.model);
            return (
              <circle
                key={p.label}
                cx={cx} cy={cy} r={r}
                fill={col} fillOpacity="0.75"
                stroke={col} strokeWidth="1.5" strokeOpacity="0.9"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setTooltip({ label: p.label, model: p.model, cost: p.costUsd, quality: p.quality, x: cx, y: cy })}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>

        {tooltip && (
          <div className="tt" style={{ position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 10, pointerEvents: 'none' }}>
            <div style={{ fontWeight: 600, color: 'var(--mist)', marginBottom: 4 }}>{tooltip.label}</div>
            <div style={{ color: 'var(--steel)', fontSize: 10 }}>
              model: <span className="mono" style={{ color: 'var(--fog)' }}>{tooltip.model}</span>
            </div>
            <div style={{ color: 'var(--steel)', fontSize: 10 }}>
              cost: <span className="mono" style={{ color: 'var(--warn)' }}>{fmtUsd(tooltip.cost)}</span>
            </div>
            <div style={{ color: 'var(--steel)', fontSize: 10 }}>
              quality: <span className="mono" style={{ color: 'var(--good)' }}>{tooltip.quality.toFixed(1)}</span>
            </div>
          </div>
        )}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        {usedModels.map(m => (
          <span key={m} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--steel)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: modelColor(m), display: 'inline-block' }} />
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
