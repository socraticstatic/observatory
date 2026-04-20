'use client';

import { useState, useMemo } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';

// Claude warm terracotta palette
function modelColor(model: string): string {
  if (model.includes('opus'))   return '#D97757';
  if (model.includes('sonnet')) return '#C9966B';
  if (model.includes('haiku'))  return '#9EA87A';
  if (model.includes('gemini')) return '#8BA89C';
  if (model.includes('grok'))   return '#A08870';
  return '#7A8878';
}

const DEMO_POINTS = [
  { label: 'research_agent', costUsd: 14.2, quality: 96, model: 'claude-opus-4',   hasQuality: true },
  { label: 'inbox_triage',   costUsd: 1.8,  quality: 84, model: 'claude-haiku-4',  hasQuality: true },
  { label: 'code_review',    costUsd: 8.4,  quality: 94, model: 'claude-sonnet-4', hasQuality: true },
  { label: 'trip_planning',  costUsd: 2.2,  quality: 91, model: 'gemini-2.0',      hasQuality: true },
  { label: 'market_scan',    costUsd: 1.1,  quality: 78, model: 'grok-3',          hasQuality: true },
  { label: 'quick_edits',    costUsd: 0.4,  quality: 88, model: 'claude-haiku-4',  hasQuality: true },
  { label: 'deep_research',  costUsd: 18.8, quality: 98, model: 'claude-opus-4',   hasQuality: true },
  { label: 'automation',     costUsd: 6.2,  quality: 72, model: 'grok-3',          hasQuality: true },
];

const PL = 52, PR = 24, PT = 28, PB = 44;
const W = 460, H = 300;
const DW = W - PL - PR;
const DH = H - PT - PB;

interface Pt { label: string; costUsd: number; quality: number; model: string; hasQuality: boolean }
interface TT  { label: string; model: string; cost: number; quality: number; hasQuality: boolean; x: number; y: number }

export function QualityCostScatter() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TT | null>(null);

  const { data: raw } = trpc.costDrivers.qualityCostByProject.useQuery({ lookback: '24H' });

  const isDemo = !raw || raw.length === 0;

  const points = useMemo<Pt[]>(() => {
    if (!isDemo) return raw as Pt[];
    return DEMO_POINTS;
  }, [raw, isDemo]);

  const allNoQuality = points.every(p => !p.hasQuality);
  const costMax = Math.max(...points.map(p => p.costUsd)) * 1.15 || 1;
  const qualMin = allNoQuality ? 60 : Math.max(0,   Math.min(...points.map(p => p.quality)) - 8);
  const qualMax = allNoQuality ? 100 : Math.min(100, Math.max(...points.map(p => p.quality)) + 4);

  const cR = costMax || 1;
  const qR = qualMax - qualMin || 1;

  const toX  = (c: number) => PL + (c / cR) * DW;
  const toY  = (q: number) => PT + (1 - (q - qualMin) / qR) * DH;
  const toYP = (p: Pt)     => p.hasQuality ? toY(p.quality) : toY(qualMin + qR * 0.5);
  const toR  = (c: number) => 5 + (c / costMax) * 7;

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(t => t * costMax);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => qualMin + t * qR);
  const usedModels = [...new Set(points.map(p => p.model))];

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fog)', letterSpacing: '-.01em', lineHeight: 1.2 }}>
            Quality × Cost
          </div>
          <div style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 3, letterSpacing: '.08em' }}>
            efficiency frontier · 24h window
          </div>
        </div>
        {isDemo && (
          <div style={{
            fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600,
            color: '#D97757', background: 'rgba(217,119,87,.08)',
            border: '1px solid rgba(217,119,87,.2)',
            padding: '3px 8px', borderRadius: 4,
          }}>
            demo
          </div>
        )}
        {!isDemo && allNoQuality && (
          <div style={{
            fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
            color: 'var(--graphite)', background: 'rgba(255,255,255,.03)',
            border: '1px solid var(--line)',
            padding: '3px 8px', borderRadius: 4,
          }}>
            no scores
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          width={W} height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
        >
          <defs>
            {usedModels.map(m => {
              const col = modelColor(m);
              const id  = `rg-${m.replace(/[^a-z0-9]/gi, '')}`;
              return (
                <radialGradient key={id} id={id} cx="38%" cy="32%" r="68%">
                  <stop offset="0%"   stopColor={col} stopOpacity="1" />
                  <stop offset="100%" stopColor={col} stopOpacity="0.4" />
                </radialGradient>
              );
            })}
            <filter id="scatter-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Warm chart-area tint */}
          <rect x={PL} y={PT} width={DW} height={DH}
            fill="rgba(217,119,87,.014)" rx="3" />

          {/* Grid */}
          {xTicks.map((v, i) => (
            <line key={`gx${i}`} x1={toX(v)} y1={PT} x2={toX(v)} y2={PT + DH}
              stroke="rgba(255,255,255,.032)" strokeWidth="1" />
          ))}
          {yTicks.map((v, i) => (
            <line key={`gy${i}`} x1={PL} y1={toY(v)} x2={PL + DW} y2={toY(v)}
              stroke="rgba(255,255,255,.032)" strokeWidth="1" />
          ))}

          {/* X tick labels */}
          {xTicks.map((v, i) => (
            <text key={`tx${i}`} x={toX(v)} y={PT + DH + 17}
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace" fontSize="9"
              fill="rgba(200,185,165,.36)"
            >
              {v < 0.005 ? '$0' : v < 1 ? `$${v.toFixed(2)}` : `$${Math.round(v)}`}
            </text>
          ))}

          {/* Y tick labels */}
          {yTicks.map((v, i) => (
            <text key={`ty${i}`} x={PL - 7} y={toY(v) + 3.5}
              textAnchor="end"
              fontFamily="'JetBrains Mono', monospace" fontSize="9"
              fill="rgba(200,185,165,.36)"
            >
              {v.toFixed(0)}
            </text>
          ))}

          {/* Axis labels */}
          <text x={PL + DW / 2} y={H - 4} textAnchor="middle"
            fontSize="9" letterSpacing=".13em" fill="rgba(200,185,165,.26)">
            COST (USD)
          </text>
          <text x={11} y={PT + DH / 2} textAnchor="middle"
            fontSize="9" letterSpacing=".13em" fill="rgba(200,185,165,.26)"
            transform={`rotate(-90, 11, ${PT + DH / 2})`}>
            QUALITY
          </text>

          {/* Efficiency frontier */}
          <line
            x1={toX(0)} y1={toY(qualMin + qR * 0.08)}
            x2={toX(costMax * 0.9)} y2={toY(qualMax * 0.99)}
            stroke="rgba(217,119,87,.16)" strokeWidth="1.5" strokeDasharray="5 5"
          />

          {/* Data points — rendered back to front by cost so large dots are on top */}
          {[...points].sort((a, b) => a.costUsd - b.costUsd).map(p => {
            const cx  = toX(p.costUsd);
            const cy  = toYP(p);
            const r   = toR(p.costUsd);
            const col = modelColor(p.model);
            const gid = `rg-${p.model.replace(/[^a-z0-9]/gi, '')}`;
            const on  = hovered === p.label;

            return (
              <g key={p.label} style={{ cursor: 'pointer' }}
                onMouseEnter={() => {
                  setHovered(p.label);
                  setTooltip({ label: p.label, model: p.model, cost: p.costUsd, quality: p.quality, hasQuality: p.hasQuality, x: cx, y: cy });
                }}
                onMouseLeave={() => { setHovered(null); setTooltip(null); }}
              >
                {on && (
                  <circle cx={cx} cy={cy} r={r + 6}
                    fill="none" stroke={col} strokeWidth="1" strokeOpacity=".22" />
                )}
                {!p.hasQuality && (
                  <circle cx={cx} cy={cy} r={r + 3}
                    fill="none" stroke={col} strokeWidth="1"
                    strokeOpacity=".28" strokeDasharray="3 2.5" />
                )}
                <circle
                  cx={cx} cy={cy} r={on ? r + 2 : r}
                  fill={`url(#${gid})`}
                  stroke={col}
                  strokeWidth={on ? 1.5 : 1}
                  strokeOpacity={on ? 1 : 0.65}
                  filter={on ? 'url(#scatter-glow)' : undefined}
                />
                {on && (
                  <text x={cx} y={cy - r - 9}
                    textAnchor="middle" fontSize="10" fontWeight="500"
                    fill={col}>
                    {p.label.replace(/_/g, '\u00a0')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {tooltip && (
          <div style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 14, W - 172),
            top: Math.max(4, tooltip.y - 46),
            pointerEvents: 'none',
            background: 'linear-gradient(160deg, #211C18 0%, #19150F 100%)',
            border: '1px solid rgba(217,119,87,.22)',
            borderRadius: 6,
            padding: '9px 13px',
            minWidth: 158,
            boxShadow: '0 10px 32px rgba(0,0,0,.65)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#E8D5C0', marginBottom: 7, lineHeight: 1.3 }}>
              {tooltip.label.replace(/_/g, ' ')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px' }}>
              <span style={{ fontSize: 10, color: 'rgba(200,185,165,.5)' }}>model</span>
              <span className="mono" style={{ fontSize: 9, color: 'rgba(200,185,165,.65)' }}>{tooltip.model}</span>
              <span style={{ fontSize: 10, color: 'rgba(200,185,165,.5)' }}>cost</span>
              <span className="mono" style={{ fontSize: 11, color: '#D97757', fontWeight: 600 }}>{fmtUsd(tooltip.cost)}</span>
              <span style={{ fontSize: 10, color: 'rgba(200,185,165,.5)' }}>quality</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: tooltip.hasQuality ? '#9EA87A' : 'rgba(200,185,165,.3)' }}>
                {tooltip.hasQuality ? tooltip.quality.toFixed(1) : 'n/a'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap',
        paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.04)',
      }}>
        {usedModels.map(m => (
          <span key={m} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: modelColor(m), display: 'inline-block',
              boxShadow: `0 0 5px ${modelColor(m)}55`,
            }} />
            <span style={{ color: 'var(--steel)' }}>{m}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
