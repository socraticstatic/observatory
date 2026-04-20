'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { fmt } from '@/lib/fmt';
import { LOOKBACKS, Lookback } from '@/lib/lookback';
import { trpc } from '@/lib/trpc-client';

type ViewMode = 'stacked' | 'grouped' | 'flow';

interface Bar {
  cached: number;
  input: number;
  output: number;
  reasoning: number;
}

const LAYERS: { key: keyof Bar; label: string; color: string }[] = [
  { key: 'cached',    label: 'Cached',    color: '#4F7B83' },
  { key: 'input',     label: 'Input',     color: '#6FA8B3' },
  { key: 'output',    label: 'Output',    color: '#9BC4CC' },
  { key: 'reasoning', label: 'Reasoning', color: '#C9966B' },
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
      ? Math.max(b.cached, b.input, b.output, b.reasoning)
      : b.cached + b.input + b.output + b.reasoning
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
              <stop offset="0%" stopColor={l.color} stopOpacity=".9" />
              <stop offset="100%" stopColor={l.color + 'CC'} stopOpacity=".75" />
            </linearGradient>
          ))}
          <pattern id="wc-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(42,49,55,.6)" strokeWidth=".5" />
          </pattern>
        </defs>

        {/* Grid */}
        <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="url(#wc-grid)" />

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
          const total = bar.cached + bar.input + bar.output + bar.reasoning;
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
        {data.map((_, i) => {
          if (i % 4 !== 0) return null;
          const x = PAD_L + i * barGroupW + barGroupW / 2;
          return (
            <text key={i} x={x} y={H - 6} textAnchor="middle" fill="#4A5358"
              fontSize={9} fontFamily="JetBrains Mono, monospace">{i + 1}</text>
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
              {(tooltip.bar.cached / (tooltip.bar.cached + tooltip.bar.input + tooltip.bar.output + tooltip.bar.reasoning) * 100).toFixed(0)}%
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
      cached:    acc.cached + b.cached,
      input:     acc.input + b.input,
      output:    acc.output + b.output,
      reasoning: acc.reasoning + b.reasoning,
    }),
    { cached: 0, input: 0, output: 0, reasoning: 0 }
  );
  const grand = totals.cached + totals.input + totals.output + totals.reasoning;

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LAYERS.map(l => {
          const val = totals[l.key];
          const pct = grand ? ((val / grand) * 100).toFixed(0) : '0';
          const barW = grand ? (val / grand) * 100 : 0;
          return (
            <div key={l.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: 'var(--fog)' }}>{l.label}</span>
                <span className="num" style={{ fontSize: 10, color: 'var(--steel)' }}>{pct}%</span>
              </div>
              <div style={{ height: 3, background: 'var(--line)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${barW}%`, background: l.color, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', padding: '10px 10px', background: 'rgba(79,123,131,.08)', border: '1px solid rgba(79,123,131,.2)', borderRadius: 'var(--r)' }}>
        <div className="label" style={{ marginBottom: 4 }}>Cache Savings</div>
        <div className="num" style={{ fontSize: 18, color: 'var(--accent)', fontWeight: 600 }}>$8.42</div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>/ day est.</div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// WhatCard
// -----------------------------------------------------------------------
interface WhatCardProps {
  lookback: Lookback;
  onDrill?: (b: any, i: number) => void;
}

export function WhatCard({ lookback, onDrill }: WhatCardProps) {
  const [mode, setMode] = useState<ViewMode>('stacked');
  const [width, setWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: rawData } = trpc.what.tokenLifecycle.useQuery({ lookback });
  const data: Bar[] = rawData?.map(r => ({
    cached: r.cached,
    input: r.input,
    output: r.output,
    reasoning: r.reasoning,
  })) ?? [];

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <span className="label">WHAT &middot; Token Lifecycle</span>
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
