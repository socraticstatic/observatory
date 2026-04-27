'use client';

import { useState, useMemo, useRef, useLayoutEffect, Fragment } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

function quadrantColor(normCost: number, normQuality: number): string {
  const highQuality = normQuality >= 0.5;
  const highCost    = normCost    >= 0.5;
  if (highQuality && !highCost)  return '#7CA893'; // efficient
  if (highQuality &&  highCost)  return '#9BC4CC'; // premium
  if (!highQuality && !highCost) return '#8A9297'; // low-value
  return '#B86B6B';                                // over-spend
}

function quadrantTag(normCost: number, normQuality: number): string {
  const highQuality = normQuality >= 0.5;
  const highCost    = normCost    >= 0.5;
  if (highQuality && !highCost)  return 'efficient';
  if (highQuality &&  highCost)  return 'premium';
  if (!highQuality && !highCost) return 'low-value';
  return 'over-spend';
}

interface Pt {
  label: string;
  cost: number;
  quality: number;
  normCost: number;
  normQuality: number;
  size: number;
  col: string;
  tag: string;
  hasQuality: boolean;
}

const H = 280;
const PAD = { l: 40, r: 16, t: 14, b: 30 };

export function QualityCostScatter({ lookback, provider }: { lookback: Lookback; provider?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(520);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      if (ref.current) setW(ref.current.offsetWidth);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const [hover, setHover] = useState<number | null>(null);

  const { data: raw } = trpc.costDrivers.qualityCostByProject.useQuery({ lookback, provider });

  const { points, iw, ih } = useMemo(() => {
    const rows = raw ?? [];
    const iw   = w - PAD.l - PAD.r;
    const ih   = H - PAD.t - PAD.b;

    if (!rows.length) return { points: [] as Pt[], iw, ih };

    const maxCost    = Math.max(...rows.map(r => r.costUsd)) || 1;
    const hasQuality = rows.some(r => r.hasQuality);
    const maxQuality = hasQuality ? 100 : 1;

    const points: Pt[] = rows.map(r => {
      const normCost    = r.costUsd / maxCost;
      const normQuality = r.hasQuality ? r.quality / maxQuality : 0.5;
      return {
        label:       r.label,
        cost:        r.costUsd,
        quality:     r.quality,
        normCost,
        normQuality,
        size:        5 + normCost * 9,
        col:         quadrantColor(normCost, normQuality),
        tag:         quadrantTag(normCost, normQuality),
        hasQuality:  r.hasQuality,
      };
    });

    return { points, iw, ih };
  }, [raw, w]);

  const cx = (normCost: number)    => PAD.l + normCost    * iw;
  const cy = (normQuality: number) => PAD.t + (1 - normQuality) * ih;

  if (!raw) return (
    <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
    </div>
  );

  return (
    <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label">VALUE</span>
            <span style={{ width: 14, height: 1, background: 'var(--line-2)' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Quality × Cost per project</span>
          </div>
          <div className="label" style={{ marginTop: 4, color: 'var(--graphite)' }}>
            {points.length} projects · {lookback.toLowerCase()} window · quality-score composite
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--steel)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {(['efficient', 'premium', 'low-value', 'over-spend'] as const).map(tag => {
            const colors: Record<string, string> = { efficient: '#7CA893', premium: '#9BC4CC', 'low-value': '#8A9297', 'over-spend': '#B86B6B' };
            return (
              <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[tag] }} />
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </span>
            );
          })}
        </div>
      </div>

      <div ref={ref} style={{ padding: 4, position: 'relative' }}>
        {points.length === 0 ? (
          <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--steel)' }}>No project data for this window.</span>
          </div>
        ) : (
          <svg width={w} height={H} style={{ display: 'block' }}>
            {/* Quadrant fills */}
            <rect x={PAD.l}       y={PAD.t}        width={iw / 2} height={ih / 2} fill="rgba(155,196,204,.03)" />
            <rect x={PAD.l+iw/2} y={PAD.t}        width={iw / 2} height={ih / 2} fill="rgba(155,196,204,.06)" />
            <rect x={PAD.l}       y={PAD.t+ih/2}   width={iw / 2} height={ih / 2} fill="rgba(138,146,151,.04)" />
            <rect x={PAD.l+iw/2} y={PAD.t+ih/2}   width={iw / 2} height={ih / 2} fill="rgba(184,107,107,.06)" />

            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((p, i) => (
              <Fragment key={`grid-${i}`}>
                <line x1={PAD.l} x2={PAD.l+iw} y1={PAD.t+ih*p} y2={PAD.t+ih*p} stroke="rgba(138,146,151,.1)" strokeDasharray="2 3" />
                <line y1={PAD.t} y2={PAD.t+ih} x1={PAD.l+iw*p} x2={PAD.l+iw*p} stroke="rgba(138,146,151,.1)" strokeDasharray="2 3" />
              </Fragment>
            ))}

            {/* Quadrant dividers */}
            <line x1={PAD.l+iw/2} x2={PAD.l+iw/2} y1={PAD.t}      y2={PAD.t+ih} stroke="var(--accent)" strokeDasharray="4 4" opacity=".4" />
            <line y1={PAD.t+ih/2} y2={PAD.t+ih/2} x1={PAD.l}       x2={PAD.l+iw} stroke="var(--accent)" strokeDasharray="4 4" opacity=".4" />

            {/* Pareto frontier */}
            <path
              d={`M ${PAD.l} ${PAD.t+ih*.05} Q ${PAD.l+iw*.3} ${PAD.t+ih*.1} ${PAD.l+iw*.6} ${PAD.t+ih*.35} T ${PAD.l+iw} ${PAD.t+ih*.6}`}
              stroke="#6FA8B3" strokeWidth="1" fill="none" strokeDasharray="1 3" opacity=".5"
            />

            {/* Quadrant labels */}
            <text x={PAD.l+8}     y={PAD.t+14}   fill="#7CA893" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">EFFICIENT</text>
            <text x={PAD.l+iw-8}  y={PAD.t+14}   textAnchor="end" fill="#9BC4CC" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">PREMIUM</text>
            <text x={PAD.l+8}     y={PAD.t+ih-6} fill="#8A9297" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">LOW-VALUE</text>
            <text x={PAD.l+iw-8}  y={PAD.t+ih-6} textAnchor="end" fill="#B86B6B" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">OVER-SPEND</text>

            {/* Axes */}
            <line x1={PAD.l} x2={PAD.l+iw} y1={PAD.t+ih} y2={PAD.t+ih} stroke="var(--line-2)" />
            <line x1={PAD.l} x2={PAD.l}    y1={PAD.t}     y2={PAD.t+ih} stroke="var(--line-2)" />

            {/* Axis labels */}
            <text x={PAD.l+iw/2} y={H-4} textAnchor="middle" fill="var(--graphite)" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">COST (USD)</text>
            <text x={9} y={PAD.t+ih/2} textAnchor="middle" fill="var(--graphite)" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1" transform={`rotate(-90,9,${PAD.t+ih/2})`}>QUALITY</text>

            {/* Data points */}
            {points.map((pt, i) => {
              const x   = cx(pt.normCost);
              const y   = cy(pt.normQuality);
              const on  = hover === i;
              return (
                <g key={pt.label} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}>
                  {on && <circle cx={x} cy={y} r={pt.size + 6} fill="none" stroke={pt.col} strokeWidth="1" strokeOpacity=".22" />}
                  {!pt.hasQuality && (
                    <circle cx={x} cy={y} r={pt.size + 3} fill="none" stroke={pt.col} strokeWidth="1" strokeOpacity=".28" strokeDasharray="3 2.5" />
                  )}
                  <circle cx={x} cy={y} r={on ? pt.size + 2 : pt.size}
                    fill={pt.col} fillOpacity={on ? 0.9 : 0.7}
                    stroke={pt.col} strokeWidth={on ? 1.5 : 1} strokeOpacity={on ? 1 : 0.65}
                  />
                  {on && (
                    <text x={x} y={y - pt.size - 7} textAnchor="middle" fontSize="10" fontWeight="500" fill={pt.col}>
                      {pt.label.replace(/_/g, '\u00a0')}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Tooltip */}
        {hover !== null && points[hover] && (
          <div style={{
            position: 'absolute',
            left: Math.min(cx(points[hover].normCost) + 14, w - 172),
            top: Math.max(4, cy(points[hover].normQuality) - 46),
            pointerEvents: 'none',
            background: 'linear-gradient(160deg, #1A2125 0%, #141A1E 100%)',
            border: `1px solid ${points[hover].col}44`,
            borderRadius: 'var(--r)',
            padding: '9px 13px',
            minWidth: 158,
            boxShadow: '0 10px 32px rgba(0,0,0,.65)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mist)', marginBottom: 7, lineHeight: 1.3 }}>
              {points[hover].label.replace(/_/g, ' ')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px' }}>
              <span style={{ fontSize: 10, color: 'var(--steel)' }}>tag</span>
              <span className="mono" style={{ fontSize: 9, color: points[hover].col }}>{points[hover].tag}</span>
              <span style={{ fontSize: 10, color: 'var(--steel)' }}>cost</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{fmtUsd(points[hover].cost)}</span>
              <span style={{ fontSize: 10, color: 'var(--steel)' }}>quality</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: points[hover].hasQuality ? '#9BC4CC' : 'var(--graphite)' }}>
                {points[hover].hasQuality ? points[hover].quality.toFixed(1) : 'n/a'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
