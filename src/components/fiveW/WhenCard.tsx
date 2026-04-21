'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';

const DAYS  = 30;
const HOURS = 24;

const INK  = { r: 0x0B, g: 0x10, b: 0x14 };
const PEAK = { r: 0x6F, g: 0xA8, b: 0xB3 };

function lerpColor(t: number): string {
  const r = Math.round(INK.r + (PEAK.r - INK.r) * t);
  const g = Math.round(INK.g + (PEAK.g - INK.g) * t);
  const b = Math.round(INK.b + (PEAK.b - INK.b) * t);
  return `rgb(${r},${g},${b})`;
}

const EMPTY_MATRIX: number[][] = Array.from({ length: DAYS }, () => Array(HOURS).fill(0));

const CELL_H = 14;
const PAD_L  = 44;
const PAD_R  = 8;
const PAD_T  = 8;
const PAD_B  = 28;

interface TooltipState { x: number; y: number; d: number; h: number; value: number }

interface WhenCardProps {
  onDrill?: (cell: { d: number; h: number; value: number }) => void;
  provider?: string;
}

export function WhenCard({ onDrill, provider }: WhenCardProps) {
  const [width, setWidth] = useState(700);
  const [tooltip, setTip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: heatData } = trpc.when.heatmap.useQuery(provider ? { provider } : undefined);

  // days_ago=0 → today → bottom row; days_ago=29 → oldest → top row
  const MATRIX = useMemo<number[][]>(() => {
    if (!heatData || heatData.length === 0) return EMPTY_MATRIX;
    const matrix: number[][] = Array.from({ length: DAYS }, () => Array(HOURS).fill(0));
    const maxVal = Math.max(...heatData.map(c => c.value), 1);
    for (const cell of heatData) {
      const row = DAYS - 1 - cell.days_ago;
      if (row >= 0 && row < DAYS && cell.h >= 0 && cell.h < HOURS) {
        matrix[row][cell.h] = cell.value / maxVal;
      }
    }
    return matrix;
  }, [heatData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cellW  = (width - PAD_L - PAD_R) / HOURS;
  const totalH = PAD_T + DAYS * CELL_H + PAD_B;
  const hourTicks = [0, 3, 6, 9, 12, 15, 18, 21, 23];

  // Row label: row 0 (top) = 30 days ago, row 29 (bottom) = today
  function rowLabel(d: number): string {
    const daysAgo = DAYS - 1 - d;
    if (daysAgo === 0) return 'today';
    if (daysAgo === 1) return 'yest.';
    return `D-${String(daysAgo).padStart(2, '0')}`;
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <span className="label">WHEN &middot; Activity Heatmap · 30 days × 24h</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--steel)' }}>quiet</span>
          <div style={{ width: 80, height: 8, borderRadius: 3, background: `linear-gradient(90deg, ${lerpColor(0)}, ${lerpColor(.4)}, ${lerpColor(1)})`, border: '1px solid var(--line)' }} />
          <span style={{ fontSize: 10, color: 'var(--steel)' }}>peak</span>
        </div>
      </div>

      <div style={{ padding: '10px 12px', overflowX: 'auto' }} ref={containerRef}>
        <svg width={width} height={totalH} style={{ display: 'block', overflow: 'visible' }}>
          {MATRIX.map((row, d) => {
            const y = PAD_T + d * CELL_H;
            return (
              <g key={d}>
                <text
                  x={PAD_L - 4}
                  y={y + CELL_H * 0.72}
                  textAnchor="end"
                  fill="#4A5358"
                  fontSize={8.5}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {rowLabel(d)}
                </text>
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
                      style={{ cursor: val > 0 ? 'pointer' : 'default' }}
                      onMouseMove={e => setTip({ x: e.clientX, y: e.clientY, d, h, value: val })}
                      onMouseLeave={() => setTip(null)}
                      onClick={() => val > 0 && onDrill?.({ d, h, value: val })}
                    />
                  );
                })}
              </g>
            );
          })}

          {hourTicks.map(h => (
            <text
              key={h}
              x={PAD_L + h * cellW + cellW / 2}
              y={PAD_T + DAYS * CELL_H + 14}
              textAnchor="middle"
              fill="#4A5358"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
            >
              {String(h).padStart(2, '0')}
            </text>
          ))}
        </svg>

        {tooltip && (
          <div className="tt" style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}>
            <div style={{ marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.1em' }}>
                {rowLabel(tooltip.d)} &nbsp; {String(tooltip.h).padStart(2, '0')}:00–{String(tooltip.h + 1).padStart(2, '0')}:00
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--fog)' }}>Relative activity</span>
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
