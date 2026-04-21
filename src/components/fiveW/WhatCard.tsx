'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { fmt } from '@/lib/fmt';
import { LOOKBACKS, Lookback } from '@/lib/lookback';
import { trpc } from '@/lib/trpc-client';

type ViewMode = 'stacked' | 'grouped' | 'flow';

interface Bar {
  label: string;
  cached: number;
  cacheCreation: number;
  input: number;
  output: number;
  reasoning: number;
}

type BarMetricKey = 'cached' | 'cacheCreation' | 'input' | 'output' | 'reasoning';

const LAYERS: { key: BarMetricKey; label: string; color: string; gradEnd: string }[] = [
  { key: 'cached',        label: 'Cached',      color: '#4F7B83', gradEnd: '#2F5157' },
  { key: 'cacheCreation', label: 'Cache Write',  color: '#3A6068', gradEnd: '#2A4A50' },
  { key: 'input',         label: 'Input',        color: '#6FA8B3', gradEnd: '#4F7B83' },
  { key: 'output',        label: 'Output',       color: '#9BC4CC', gradEnd: '#6FA8B3' },
  { key: 'reasoning',     label: 'Reasoning',    color: '#C9966B', gradEnd: '#8A6547' },
];

interface LCProps {
  data: Bar[];
  mode: ViewMode;
  width: number;
  onDrill?: (b: Bar, i: number) => void;
}

function LifecycleChart({ data, mode, width, onDrill }: LCProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bar: Bar; idx: number } | null>(null);
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 24;
  const innerW = width - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxVal = Math.max(...data.map(b =>
    mode === 'grouped'
      ? Math.max(b.cached, b.cacheCreation, b.input, b.output, b.reasoning)
      : b.cached + b.cacheCreation + b.input + b.output + b.reasoning
  ));

  const yScale = (v: number) => PAD_T + innerH - (v / maxVal) * innerH;
  const yTicks = [0, .25, .5, .75, 1].map(t => ({ y: yScale(t * maxVal), label: fmt(t * maxVal) }));

  const barGroupW = innerW / data.length;
  const barPad = Math.max(1, barGroupW * 0.12);

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {LAYERS.map(l => (
            <linearGradient key={l.key} id={`wc-grad-${l.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={l.color}   stopOpacity=".95" />
              <stop offset="100%" stopColor={l.gradEnd} stopOpacity=".8" />
            </linearGradient>
          ))}
          <pattern id="wc-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(42,49,55,.6)" strokeWidth=".5" />
          </pattern>
        </defs>

        {/* Horizontal grid lines only */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i}
            x1={PAD_L} x2={PAD_L + innerW}
            y1={PAD_T + innerH * (1 - p)} y2={PAD_T + innerH * (1 - p)}
            stroke="rgba(138,146,151,.08)" strokeWidth=".8"
          />
        ))}

        {/* Y axis ticks */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L - 4} y1={t.y} x2={PAD_L + innerW} y2={t.y}
              stroke="rgba(42,49,55,.8)" strokeWidth=".5" strokeDasharray={i === 0 ? 'none' : '3,3'} />
            <text x={PAD_L - 7} y={t.y + 4} textAnchor="end" fill="#4A5358" fontSize={9}
              fontFamily="JetBrains Mono, monospace">{t.label}</text>
          </g>
        ))}

        {/* Bars */}
        {data.map((bar, i) => {
          const gx = PAD_L + i * barGroupW + barPad;
          const gw = barGroupW - barPad * 2;

          if (mode === 'stacked') {
            const layers = LAYERS;
            let yCursor = yScale(0);
            return (
              <g key={i}
                onClick={() => onDrill?.(bar, i)}
                onMouseMove={e => setTooltip({ x: e.clientX, y: e.clientY, bar, idx: i })}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'pointer' }}>
                {layers.map(l => {
                  const h = (bar[l.key] / maxVal) * innerH;
                  const y = yCursor - h;
                  yCursor = y;
                  return (
                    <rect key={l.key} x={gx} y={y} width={gw} height={h}
                      fill={`url(#wc-grad-${l.key})`} />
                  );
                })}
              </g>
            );
          }

          if (mode === 'grouped') {
            const subW = gw / LAYERS.length;
            return (
              <g key={i}
                onMouseMove={e => setTooltip({ x: e.clientX, y: e.clientY, bar, idx: i })}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onDrill?.(bar, i)}
                style={{ cursor: 'pointer' }}>
                {LAYERS.map((l, li) => {
                  const h = (bar[l.key] / maxVal) * innerH;
                  return (
                    <rect key={l.key} x={gx + li * subW + .5} y={yScale(bar[l.key])}
                      width={subW - 1} height={h}
                      fill={`url(#wc-grad-${l.key})`} />
                  );
                })}
              </g>
            );
          }

          // flow: area-style, single bar representing total with gradient
          const total = bar.cached + bar.cacheCreation + bar.input + bar.output + bar.reasoning;
          const h = (total / maxVal) * innerH;
          return (
            <rect key={i} x={gx} y={yScale(total)} width={gw} height={h}
              fill={`url(#wc-grad-input)`} opacity=".7"
              onMouseMove={e => setTooltip({ x: e.clientX, y: e.clientY, bar, idx: i })}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => onDrill?.(bar, i)}
              style={{ cursor: 'pointer' }} />
          );
        })}

        {/* X axis labels every 4th bar */}
        {data.map((bar, i) => {
          if (i % 4 !== 0) return null;
          const x = PAD_L + i * barGroupW + barGroupW / 2;
          return (
            <text key={i} x={x} y={H - 6} textAnchor="middle" fill="var(--steel)"
              fontSize={9} fontFamily="JetBrains Mono, monospace">{bar.label}</text>
          );
        })}
      </svg>

      {tooltip && (
        <div className="tt" style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}>
          <div style={{ fontSize: 10, color: 'var(--steel)', marginBottom: 6, letterSpacing: '.1em' }}>
            BAR {tooltip.idx + 1}
          </div>
          {LAYERS.map(l => (
            <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: 'var(--fog)' }}>{l.label}</span>
              </span>
              <span className="num" style={{ fontSize: 11 }}>{fmt(tooltip.bar[l.key])}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 5, paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--steel)' }}>Cache ratio</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--accent)' }}>
              {(tooltip.bar.cached / (tooltip.bar.cached + tooltip.bar.cacheCreation + tooltip.bar.input + tooltip.bar.output + tooltip.bar.reasoning) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Sidebar
// -----------------------------------------------------------------------
interface SidebarProps {
  data: Bar[];
  lookback: Lookback;
}

function Sidebar({ data, lookback }: SidebarProps) {
  const totals = data.reduce(
    (acc, b) => ({
      cached:        acc.cached + b.cached,
      cacheCreation: acc.cacheCreation + b.cacheCreation,
      input:         acc.input + b.input,
      output:        acc.output + b.output,
      reasoning:     acc.reasoning + b.reasoning,
    }),
    { cached: 0, cacheCreation: 0, input: 0, output: 0, reasoning: 0 }
  );
  const grand = totals.cached + totals.cacheCreation + totals.input + totals.output + totals.reasoning;

  return (
    <div style={{ width: 180, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '1px solid var(--line)' }}>
      <div>
        <div className="label" style={{ marginBottom: 4 }}>Total Tokens</div>
        <div className="num" style={{ fontSize: 26, fontWeight: 600, color: 'var(--mist)', lineHeight: 1 }}>
          {fmt(grand)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)', marginTop: 2 }}>
          {LOOKBACKS[lookback].label.toLowerCase()}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {([
          { key: 'reasoning' as BarMetricKey, label: 'Reasoning', color: '#C9966B' },
          { key: 'output'    as BarMetricKey, label: 'Output',    color: '#9BC4CC' },
          { key: 'input'     as BarMetricKey, label: 'Input',     color: '#6FA8B3' },
          { key: 'cached'    as BarMetricKey, label: 'Cached',    color: '#4F7B83' },
        ]).map(l => {
          const val = totals[l.key];
          const pct = grand > 0 ? val / grand : 0;
          const isReasoningHigh = l.key === 'reasoning' && pct > 0.18;
          return (
            <div key={l.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fog)', marginBottom: 3 }}>
                <span>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: l.color, marginRight: 6, verticalAlign: 'middle' }} />
                  {l.label}
                  {isReasoningHigh && (
                    <span style={{ color: '#C9966B', marginLeft: 6, fontSize: 9, letterSpacing: '.1em' }}>↑ OPUS</span>
                  )}
                </span>
                <span className="num">{fmt(val)}</span>
              </div>
              <div style={{ height: 3, background: 'var(--ink)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: l.color }} />
              </div>
              <div className="num" style={{ fontSize: 10, color: 'var(--steel)', marginTop: 2 }}>
                {(pct * 100).toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', padding: '10px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(111,168,179,.04)' }}>
        <div className="label" style={{ color: 'var(--accent-2)' }}>Cache Savings</div>
        <div className="num" style={{ fontSize: 16, color: 'var(--mist)', marginTop: 2 }}>
          {/* $2.70/MTok saved: Claude input $3/MTok vs cache read $0.30/MTok */}
          ${((totals.cached * 2.70) / 1_000_000).toFixed(2)} <span style={{ fontSize: 10, color: 'var(--steel)' }}>/ {LOOKBACKS[lookback].label.toLowerCase()}</span>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// WhatCard
// -----------------------------------------------------------------------
interface WhatCardProps {
  lookback: Lookback;
  provider?: string;
  onDrill?: (b: Bar, i: number) => void;
}

function formatBucketLabel(isoStr: string, lookback: Lookback, index: number, total: number): string {
  const d = new Date(isoStr);
  if (lookback === '1H') {
    const minsAgo = total - 1 - index;
    return minsAgo === 0 ? 'now' : `-${minsAgo}m`;
  }
  if (lookback === '24H') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
  }
  const daysAgo = total - 1 - index;
  return daysAgo === 0 ? 'today' : `D-${String(daysAgo).padStart(2, '0')}`;
}

export function WhatCard({ lookback, provider, onDrill }: WhatCardProps) {
  const [mode, setMode] = useState<ViewMode>('stacked');
  const [width, setWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: rawData } = trpc.what.tokenLifecycle.useQuery({ lookback, provider });
  const data: Bar[] = (rawData ?? []).map((r, i, arr) => ({
    label:         formatBucketLabel(r.label, lookback, i, arr.length),
    cached:        r.cached,
    cacheCreation: r.cacheCreation ?? 0,
    input:         r.input,
    output:        r.output,
    reasoning:     r.reasoning,
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setWidth(e.contentRect.width - 180);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data.length) return (
    <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
      <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
    </div>
  );

  return (
    <div className="card" ref={containerRef}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label">WHAT</span>
            <span style={{ width: 14, height: 1, background: 'var(--line-2)' }} />
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.02em' }}>Token Lifecycle</span>
          </div>
          <div className="label" style={{ marginTop: 4, color: 'var(--graphite)' }}>
            Input · Output · Reasoning · Cached · {LOOKBACKS[lookback].label.toLowerCase()} rolling · click bar to drill →
          </div>
        </div>
        <div className="seg">
          {(['stacked', 'grouped', 'flow'] as ViewMode[]).map(m => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 180px' }}>
        <div style={{ padding: '12px 0 12px 8px', minWidth: 0 }}>
          <LifecycleChart data={data} mode={mode} width={Math.max(200, width - 8)} onDrill={onDrill} />
        </div>
        <Sidebar data={data} lookback={lookback} />
      </div>
    </div>
  );
}
