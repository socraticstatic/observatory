'use client';

import { useRef, useState, useEffect } from 'react';
import { makeRng } from '@/lib/rng';

const DAYS = 30;
const HOURS = 24;

// Color interpolation from ink (#0B1014) to accent (#6FA8B3)
const INK  = { r: 0x0B, g: 0x10, b: 0x14 };
const ACCT = { r: 0x6F, g: 0xA8, b: 0xB3 };

function lerpColor(t: number): string {
  const r = Math.round(INK.r + (ACCT.r - INK.r) * t);
  const g = Math.round(INK.g + (ACCT.g - INK.g) * t);
  const b = Math.round(INK.b + (ACCT.b - INK.b) * t);
  return `rgb(${r},${g},${b})`;
}

function buildMatrix(): number[][] {
  const r = makeRng(21);
  return Array.from({ length: DAYS }, (_, d) =>
    Array.from({ length: HOURS }, (_, h) => {
      const dayPart  = 0.2 + 0.8 * Math.max(0, Math.sin((h - 6) / 24 * Math.PI));
      const weekPart = (d % 7 === 5 || d % 7 === 6) ? 0.4 : 1;
      const noise    = 0.4 + r() * 0.6;
      return Math.min(1, dayPart * weekPart * noise);
    })
  );
}

const MATRIX = buildMatrix();

const CELL_H = 14;
const PAD_L  = 44;
const PAD_R  = 8;
const PAD_T  = 8;
const PAD_B  = 28;

interface TooltipState { x: number; y: number; d: number; h: number; value: number }

interface WhenCardProps {
  onDrill?: (cell: { d: number; h: number; value: number }) => void;
}

export function WhenCard({ onDrill }: WhenCardProps) {
  const [width, setWidth]   = useState(700);
  const [tooltip, setTip]   = useState<TooltipState | null>(null);
  const containerRef        = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cellW = (width - PAD_L - PAD_R) / HOURS;
  const totalH = PAD_T + DAYS * CELL_H + PAD_B;

  // Hour ticks to show: 00, 06, 12, 18, 23
  const hourTicks = [0, 6, 12, 18, 23];

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <span className="label">WHEN &middot; Activity Heatmap</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--steel)' }}>low</span>
          <div style={{ width: 80, height: 8, borderRadius: 3, background: `linear-gradient(90deg, ${lerpColor(0)}, ${lerpColor(.5)}, ${lerpColor(1)})`, border: '1px solid var(--line)' }} />
          <span style={{ fontSize: 10, color: 'var(--steel)' }}>high</span>
        </div>
      </div>

      {/* Heatmap */}
      <div style={{ padding: '10px 12px', overflowX: 'auto' }} ref={containerRef}>
        <svg width={width} height={totalH} style={{ display: 'block', overflow: 'visible' }}>
          {/* Row labels + cells */}
          {MATRIX.map((row, d) => {
            const y = PAD_T + d * CELL_H;
            return (
              <g key={d}>
                {/* Day label */}
                <text
                  x={PAD_L - 4}
                  y={y + CELL_H * 0.72}
                  textAnchor="end"
                  fill="#4A5358"
                  fontSize={8.5}
                  fontFamily="JetBrains Mono, monospace"
                >
                  D-{String(d + 1).padStart(2, '0')}
                </text>

                {/* Cells */}
                {row.map((val, h) => {
                  const x = PAD_L + h * cellW;
                  return (
                    <rect
                      key={h}
                      x={x + .5}
                      y={y + .5}
                      width={Math.max(1, cellW - 1)}
                      height={CELL_H - 1}
                      fill={lerpColor(val)}
                      rx={1}
                      style={{ cursor: 'pointer' }}
                      onMouseMove={e => setTip({ x: e.clientX, y: e.clientY, d, h, value: val })}
                      onMouseLeave={() => setTip(null)}
                      onClick={() => onDrill?.({ d, h, value: val })}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Column hour labels */}
          {hourTicks.map(h => {
            const x = PAD_L + h * cellW + cellW / 2;
            return (
              <text
                key={h}
                x={x}
                y={PAD_T + DAYS * CELL_H + 14}
                textAnchor="middle"
                fill="#4A5358"
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
              >
                {String(h).padStart(2, '0')}
              </text>
            );
          })}
        </svg>

        {tooltip && (
          <div className="tt" style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.1em' }}>
                D-{String(tooltip.d + 1).padStart(2, '0')} &nbsp; {String(tooltip.h).padStart(2, '0')}:00
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--fog)' }}>Activity</span>
              <span className="num" style={{ fontSize: 11, color: lerpColor(tooltip.value) }}>
                {(tooltip.value * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
