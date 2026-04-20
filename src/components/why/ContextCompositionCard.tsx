'use client';

import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const CX = 80, CY = 80, R_OUTER = 66, R_INNER = 43;

interface Seg { label: string; tokens: number; pct: number; color: string }

function buildDonut(segments: Seg[]) {
  const paths: { d: string; col: string; label: string }[] = [];
  let cumDeg = -90;

  for (const seg of segments) {
    if (seg.pct <= 0) continue;
    const startDeg = cumDeg;
    const sweepDeg = (seg.pct / 100) * 360;
    cumDeg += sweepDeg;

    const toRad = (d: number) => (d * Math.PI) / 180;
    const s = toRad(startDeg), e = toRad(cumDeg);

    const x1o = CX + R_OUTER * Math.cos(s), y1o = CY + R_OUTER * Math.sin(s);
    const x2o = CX + R_OUTER * Math.cos(e), y2o = CY + R_OUTER * Math.sin(e);
    const x1i = CX + R_INNER * Math.cos(e), y1i = CY + R_INNER * Math.sin(e);
    const x2i = CX + R_INNER * Math.cos(s), y2i = CY + R_INNER * Math.sin(s);
    const large = sweepDeg > 180 ? 1 : 0;

    paths.push({
      label: seg.label,
      col: seg.color,
      d: [
        `M ${x1o.toFixed(2)} ${y1o.toFixed(2)}`,
        `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${x2o.toFixed(2)} ${y2o.toFixed(2)}`,
        `L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`,
        `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${x2i.toFixed(2)} ${y2i.toFixed(2)}`,
        'Z',
      ].join(' '),
    });
  }

  return paths;
}

function fmtTok(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function ContextCompositionCard({ lookback }: { lookback: Lookback }) {
  const { data } = trpc.costDrivers.contextComposition.useQuery({ lookback });

  const isEmpty  = !data || data.totalTokens === 0;
  const segments = data?.segments ?? [];
  const total    = data?.totalTokens ?? 0;

  const paths = buildDonut(segments);

  // Find the highest-pct segment for the center callout
  const topSeg = [...segments].sort((a, b) => b.pct - a.pct)[0];

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fog)', letterSpacing: '-.01em', lineHeight: 1.2 }}>
            Context Composition
          </div>
          <div style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 3, letterSpacing: '.08em' }}>
            what fills the context window · 24h
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {/* Donut */}
        <div style={{ flexShrink: 0 }}>
          <svg width={160} height={160}>
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill={p.col}
                stroke="rgba(20,16,12,.6)" strokeWidth="2" />
            ))}
            {/* Center: dominant segment pct */}
            {topSeg && (
              <>
                <text x={CX} y={CY - 6}
                  textAnchor="middle"
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize="17" fontWeight="600"
                  fill={topSeg.color}>
                  {topSeg.pct.toFixed(0)}%
                </text>
                <text x={CX} y={CY + 9}
                  textAnchor="middle"
                  fontSize="8" letterSpacing=".1em"
                  fill="rgba(200,185,165,.4)">
                  {topSeg.label.toUpperCase()}
                </text>
                <text x={CX} y={CY + 22}
                  textAnchor="middle"
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize="9"
                  fill="rgba(200,185,165,.28)">
                  {fmtTok(total)}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Breakdown */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {segments.map(seg => (
            <div key={seg.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fog)' }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 2,
                    background: seg.color, display: 'inline-block', flexShrink: 0,
                    boxShadow: `0 0 4px ${seg.color}55`,
                  }} />
                  {seg.label}
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--graphite)' }}>
                    {fmtTok(seg.tokens)}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--steel)', minWidth: 34, textAlign: 'right' }}>
                    {seg.pct.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${seg.pct}%`,
                  background: seg.color,
                  borderRadius: 2,
                  transition: 'width 0.35s ease',
                  boxShadow: `0 0 6px ${seg.color}50`,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {isEmpty && (
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: 'var(--steel)', padding: '8px 0' }}>
          No token data yet for this window.
        </div>
      )}
      {!isEmpty && segments.find(s => s.label === 'Cached Context' && s.pct > 30) && (
        <div style={{
          marginTop: 14, padding: '8px 12px',
          background: 'rgba(122,158,138,.07)', border: '1px solid rgba(122,158,138,.18)',
          borderRadius: 'var(--r)', fontSize: 11, color: '#7A9E8A', lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 600 }}>Cache hit rate healthy.</span>{' '}
          {segments.find(s => s.label === 'Cached Context')!.pct.toFixed(0)}% of context is reused.
        </div>
      )}
      {!isEmpty && segments.find(s => s.label === 'Fresh Input' && s.pct > 60) && (
        <div style={{
          marginTop: 14, padding: '8px 12px',
          background: 'rgba(217,119,87,.07)', border: '1px solid rgba(217,119,87,.18)',
          borderRadius: 'var(--r)', fontSize: 11, color: '#D97757', lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 600 }}>Low cache utilization.</span>{' '}
          Most context is sent fresh each turn. Consider prompt caching to reduce cost.
        </div>
      )}
    </div>
  );
}
