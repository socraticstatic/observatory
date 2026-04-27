'use client';

import { type Lookback } from '@/lib/lookback';
import { fmtMs } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import { Sparkline } from '@/components/shared/Sparkline';

// ─── Delta helpers ───────────────────────────────────────────────────────────

function fmtPctDelta(current: number, prev: number): { text: string; color: string } | null {
  if (prev === 0) return null;
  const delta = ((current - prev) / prev) * 100;
  if (Math.abs(delta) < 0.5) return { text: '±0%', color: 'var(--steel)' };
  const sign = delta > 0 ? '+' : '';
  // For calls: more = neutral-ish (just info), use fog
  return { text: `${sign}${delta.toFixed(1)}%`, color: delta > 0 ? 'var(--fog)' : 'var(--fog)' };
}

function fmtHitDelta(current: number, prev: number): { text: string; color: string } | null {
  const delta = current - prev;
  if (Math.abs(delta) < 0.2) return null;
  const sign = delta > 0 ? '+' : '';
  // More cache hits = good
  return { text: `${sign}${delta.toFixed(1)}pp`, color: delta > 0 ? 'var(--good)' : 'var(--warn)' };
}

// ─── SignalDot ────────────────────────────────────────────────────────────────

function SignalDot({ level }: { level: 'warn' | 'act' }) {
  const c = level === 'act' ? 'var(--bad)' : '#C9966B';
  return (
    <span style={{
      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
      background: c, display: 'inline-block',
      boxShadow: level === 'act' ? `0 0 5px ${c}80` : 'none',
    }} />
  );
}

// ─── StatCell ────────────────────────────────────────────────────────────────

interface StatCellProps {
  label: string;
  value: string;
  col: string;
  delta?: { text: string; color: string } | null;
  sparkline?: number[];
  sparklineColor?: string;
  signal?: 'warn' | 'act';
}

function StatCell({ label, value, col, delta, sparkline, sparklineColor = 'var(--accent-2)', signal }: StatCellProps) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        {label}
        {signal && <SignalDot level={signal} />}
      </div>
      <div
        className="mono"
        style={{ fontSize: 20, fontWeight: 700, color: col, lineHeight: 1, marginBottom: 4 }}
      >
        {value}
      </div>
      {delta ? (
        <div className="mono" style={{ fontSize: 10, color: delta.color }}>
          {delta.text}
        </div>
      ) : (
        <div style={{ height: 14 }} />
      )}
      {sparkline && sparkline.length >= 2 && (
        <div style={{ marginTop: 8 }}>
          <Sparkline data={sparkline} color={sparklineColor} h={26} w={100} area />
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

const LABELS = ['Total Calls', 'Cache Hit', 'Efficiency', 'Error Rate', 'Sessions', 'Latency'];

function LoadingStrip() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 }}>
      {LABELS.map(label => (
        <div key={label} className="card" style={{ padding: '12px 14px' }}>
          <div className="label" style={{ marginBottom: 6 }}>{label}</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--graphite)', lineHeight: 1 }}>—</div>
          <div style={{ height: 14 }} />
        </div>
      ))}
    </div>
  );
}

// ─── StatStrip ────────────────────────────────────────────────────────────────

interface Props {
  lookback?: Lookback;
  provider?: string;
}

export function StatStrip({ lookback = '24H', provider }: Props) {
  const { data }      = trpc.pulse.statStrip.useQuery({ lookback, provider });
  const { data: trend } = trpc.pulse.cacheHitTrend.useQuery({ lookback, provider });

  if (!data) return <LoadingStrip />;

  const sparkPoints = trend?.map(r => r.hitPct) ?? [];

  const callDelta   = fmtPctDelta(data.totalCalls, data.prevTotalCalls);
  const cacheDelta  = fmtHitDelta(data.cacheHitPct, data.prevCacheHitPct);

  const efficiencyVal = data.efficiency > 0 ? `${data.efficiency.toFixed(1)}×` : '—';
  const latencyVal    = data.avgLatencyMs > 0 ? fmtMs(data.avgLatencyMs) : '—';
  const errorColor    = data.errorRatePct > 1 ? 'var(--warn)' : 'var(--good)';

  const cacheSignal: 'act' | 'warn' | undefined =
    data.cacheHitPct < 20 ? 'act' : data.cacheHitPct < 40 ? 'warn' : undefined;
  const errorSignal: 'act' | 'warn' | undefined =
    data.errorRatePct > 5 ? 'act' : data.errorRatePct > 1 ? 'warn' : undefined;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 }}>
      <StatCell label="Total Calls"  value={data.totalCalls.toLocaleString()} col="var(--mist)"    delta={callDelta} />
      <StatCell label="Cache Hit"    value={`${data.cacheHitPct.toFixed(1)}%`} col="var(--accent-2)" delta={cacheDelta} sparkline={sparkPoints} sparklineColor="var(--accent-2)" signal={cacheSignal} />
      <StatCell label="Efficiency"   value={efficiencyVal}                     col="var(--fog)" />
      <StatCell label="Error Rate"   value={`${data.errorRatePct.toFixed(1)}%`} col={errorColor}   signal={errorSignal} />
      <StatCell label="Sessions"     value={String(data.activeSessions)}       col="var(--mist)" />
      <StatCell label="Latency"      value={latencyVal}                        col="var(--fog)" />
    </div>
  );
}
