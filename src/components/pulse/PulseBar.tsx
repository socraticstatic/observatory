'use client';

import { useEffect, useRef, useState } from 'react';
import { fmt, fmtMs } from '@/lib/fmt';
import { LOOKBACKS, Lookback } from '@/lib/lookback';
import { trpc } from '@/lib/trpc-client';

interface Spike { i: number; }

interface Props {
  onDrillSpike?: (s: Spike) => void;
  lookback: Lookback;
  setLookback: (l: Lookback) => void;
  provider?: string;
}

const LOOKBACK_KEYS: Lookback[] = ['1H', '24H', '30D'];


function toPath(data: number[], w: number, h: number): string {
  if (!data || data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function toAreaPath(data: number[], w: number, h: number): string {
  const linePath = toPath(data, w, h);
  if (!linePath) return '';
  return `${linePath} L ${w},${h} L 0,${h} Z`;
}

export function PulseBar({ onDrillSpike, lookback, setLookback, provider }: Props) {
  const { data: chartData } = trpc.pulse.pulseChart.useQuery({ lookback, provider });
  const { data: statData }  = trpc.pulse.statStrip.useQuery({ lookback, provider });

  const tpmHist: number[] = chartData?.map(r => r.tokens) ?? [];
  const latHist: number[] = chartData?.map(r => r.latP95) ?? [];
  const tpmNow  = tpmHist[tpmHist.length - 1] ?? 0;
  const latNow  = statData?.avgLatencyMs ?? 0;

  const tpmDeltaPct = statData && statData.prevTotalCalls > 0
    ? ((statData.totalCalls - statData.prevTotalCalls) / statData.prevTotalCalls) * 100
    : null;
  const latDeltaMs = statData && statData.prevAvgLatencyMs > 0
    ? Math.round(statData.avgLatencyMs - statData.prevAvgLatencyMs)
    : null;

  const tickerItems: { text: string; col: string }[] = statData ? [
    { text: `cache hit ${statData.cacheHitPct.toFixed(0)}%`,                                           col: 'var(--accent-2)' },
    { text: `p50 ${fmtMs(statData.p50LatMs)}`,                                                        col: 'var(--steel)' },
    { text: `error rate ${statData.errorRatePct.toFixed(1)}%`,                                        col: statData.errorRatePct > 1 ? 'var(--bad)' : 'var(--good)' },
    { text: `p99 ${fmtMs(statData.p99LatMs)}`,                                                        col: 'var(--steel)' },
    { text: `${fmt(statData.totalCalls)} calls`,                                                       col: 'var(--accent)' },
    { text: `${statData.activeSessions} sessions`,                                                     col: 'var(--steel)' },
    { text: `out tok/req ${fmt(Math.round(statData.totalOutputTokens / Math.max(statData.totalCalls, 1)))}`, col: 'var(--steel)' },
    { text: `efficiency ${statData.efficiency.toFixed(2)}×`,                                           col: 'var(--steel)' },
    { text: latDeltaMs != null ? `latency ${latDeltaMs >= 0 ? '+' : ''}${latDeltaMs}ms` : `${fmt(statData.totalCalls)} calls / ${lookback}`, col: latDeltaMs != null && latDeltaMs > 50 ? 'var(--warn)' : 'var(--good)' },
  ] : [];

  // Auto-detect spikes: buckets where latP95 > 2× median
  const sortedLat = [...latHist].sort((a, b) => a - b);
  const medianLat = sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length / 2)] : 0;
  const spikes: Spike[] = latHist
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => medianLat > 0 && v > medianLat * 2)
    .map(({ i }) => ({ i }));

  const centerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(600);
  const svgH = 96;

  useEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tpmLine = toPath(tpmHist, cw, svgH);
  const tpmArea = toAreaPath(tpmHist, cw, svgH);
  const latLine = toPath(latHist, cw, svgH);

  const tTotal = (statData?.totalInputTokens ?? 0) + (statData?.totalOutputTokens ?? 0) + (statData?.totalCachedTokens ?? 0);
  const inVal  = tTotal > 0 ? Math.round(tpmNow * (statData!.totalInputTokens  / tTotal)) : Math.round(tpmNow * 0.05);
  const outVal = tTotal > 0 ? Math.round(tpmNow * (statData!.totalOutputTokens / tTotal)) : Math.round(tpmNow * 0.84);
  const cacVal = tTotal > 0 ? Math.round(tpmNow * (statData!.totalCachedTokens / tTotal)) : Math.round(tpmNow * 0.11);

  const { label } = LOOKBACKS[lookback];

  // spike x positions
  const spikeXs = spikes.map(s => ({
    ...s,
    x: tpmHist.length > 1
      ? (s.i / (tpmHist.length - 1)) * cw
      : 0,
  }));

  const timeLabels = lookback === '1H'
    ? ['-60m', '-45m', '-30m', '-15m', 'now']
    : lookback === '24H'
    ? ['-24h', '-18h', '-12h', '-6h', 'now']
    : ['-30d', '-22d', '-15d', '-7d', 'now'];

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* three-column grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '260px minmax(0,1fr) 260px',
      }}>
        {/* LEFT */}
        <div style={{
          padding: '16px 20px',
          borderRight: '1px solid var(--line)',
          background: 'rgba(111,168,179,.04)',
        }}>
          <div className="label" style={{ marginBottom: 6 }}>Tokens / Minute</div>
          <div className="num" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, color: 'var(--mist)' }}>
            {fmt(tpmNow)}
          </div>
          <div style={{ fontSize: 11, color: tpmDeltaPct == null ? 'var(--steel)' : tpmDeltaPct >= 0 ? 'var(--good)' : 'var(--warn)', marginTop: 4, marginBottom: 14 }}>
            {tpmDeltaPct == null ? '—' : `${tpmDeltaPct >= 0 ? '+' : ''}${tpmDeltaPct.toFixed(1)}%`}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'In',     val: fmt(inVal) },
              { label: 'Out',    val: fmt(outVal) },
              { label: 'Cached', val: fmt(cacVal) },
            ].map(s => (
              <div key={s.label}>
                <div className="label">{s.label}</div>
                <div className="num" style={{ fontSize: 13, color: 'var(--fog)', marginTop: 2 }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER */}
        <div ref={centerRef} style={{ minWidth: 0, padding: '12px 0 0' }}>
          {/* header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: 8 }}>
            <div className="label">Pulse — last {label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* legend */}
              <div style={{ display: 'flex', gap: 10, marginRight: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--steel)' }}>
                  <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#6FA8B3" strokeWidth="1.4"/></svg>
                  TPM
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--steel)' }}>
                  <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#C9966B" strokeWidth="1" strokeDasharray="3 3"/></svg>
                  Latency
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--steel)' }}>
                  <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#B86B6B"/></svg>
                  Spike
                </span>
              </div>
              {/* seg control */}
              <div className="seg">
                {LOOKBACK_KEYS.map(k => (
                  <button key={k} className={lookback === k ? 'on' : ''} onClick={() => setLookback(k)}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SVG chart */}
          <svg width={cw} height={svgH} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="pulseArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
              <pattern id="pulseGrid" width="40" height="20" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,.03)" strokeWidth="1"/>
              </pattern>
            </defs>

            {/* grid */}
            <rect width={cw} height={svgH} fill="url(#pulseGrid)" />

            {/* TPM area fill */}
            {tpmArea && <path d={tpmArea} fill="url(#pulseArea)" />}

            {/* TPM path */}
            {tpmLine && (
              <path d={tpmLine} fill="none" stroke="#6FA8B3" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Latency dashed path */}
            {latLine && (
              <path d={latLine} fill="none" stroke="#C9966B" strokeWidth="1" strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Spike markers */}
            {spikeXs.map((s, idx) => (
              <g key={idx} style={{ cursor: 'pointer' }} onClick={() => onDrillSpike?.(s)}>
                <line x1={s.x} y1={0} x2={s.x} y2={svgH} stroke="#B86B6B" strokeWidth="1" strokeOpacity="0.5" />
                <circle cx={s.x} cy={svgH / 2} r={3} fill="#B86B6B" />
              </g>
            ))}

            {/* NOW marker */}
            <line x1={cw - 1} y1={0} x2={cw - 1} y2={svgH} stroke="var(--mist)" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.25" />
          </svg>

          {/* time labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 16px 12px', marginTop: 2 }}>
            {timeLabels.map(t => (
              <span key={t} className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>{t}</span>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{
          padding: '16px 20px',
          borderLeft: '1px solid var(--line)',
          background: 'rgba(201,150,107,.04)',
        }}>
          <div className="label" style={{ marginBottom: 6 }}>Latency — avg</div>
          <div className="num" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, color: 'var(--mist)' }}>
            {fmtMs(latNow)}
          </div>
          <div style={{ fontSize: 11, color: latDeltaMs == null ? 'var(--steel)' : latDeltaMs > 0 ? 'var(--warn)' : 'var(--good)', marginTop: 4, marginBottom: 14 }}>
            {latDeltaMs == null ? '—' : `${latDeltaMs >= 0 ? '+' : ''}${latDeltaMs}ms`}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'p50',      val: statData?.p50LatMs ? fmtMs(statData.p50LatMs) : '—' },
              { label: 'p99',      val: statData?.p99LatMs ? fmtMs(statData.p99LatMs) : '—' },
              { label: 'Spikes/h', val: String(spikes.length) },
            ].map(s => (
              <div key={s.label}>
                <div className="label">{s.label}</div>
                <div className="num" style={{ fontSize: 13, color: 'var(--fog)', marginTop: 2 }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TICKER */}
      <div style={{ borderTop: '1px solid var(--line)', overflow: 'hidden', height: 30, display: 'flex', alignItems: 'center' }}>
        <div className="ticker-track" style={{ display: 'flex', gap: 36 }}>
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="mono" style={{ fontSize: 10, color: item.col, flexShrink: 0 }}>
              {item.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
