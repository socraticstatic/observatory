'use client';

import { type Lookback } from '@/lib/lookback';
import { fmtMs } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import { Sparkline } from '@/components/shared/Sparkline';

interface Props {
  lookback?: Lookback;
  provider?: string;
}

export function StatStrip({ lookback = '24H', provider }: Props) {
  const { data }        = trpc.pulse.statStrip.useQuery({ lookback, provider });
  const { data: trend } = trpc.pulse.cacheHitTrend.useQuery();

  const sparkPoints = trend?.map(r => r.hitPct) ?? [];

  if (!data) {
    return (
      <div className="card" style={{ padding: 0, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 12 }}>
        {['Sessions', 'Calls', 'Cache hit', 'Cost / day', 'Error rate', 'Reasoning'].map((k, i) => (
          <div key={k} style={{ padding: '14px 16px', borderRight: i < 5 ? '1px solid var(--line)' : 'none' }}>
            <div className="label">{k}</div>
            <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--graphite)', marginTop: 4 }}>—</div>
          </div>
        ))}
      </div>
    );
  }

  const hours = lookback === '1H' ? 1 : lookback === '24H' ? 24 : 24 * 30;
  const callsPerHour = hours > 0 ? Math.round(data.totalCalls / hours) : 0;
  const reasoningRatio = data.reasoningRatio;

  const stats: Array<{ k: string; v: string; sub: string; spark?: number[]; col?: string }> = [
    {
      k: 'Active sessions',
      v: String(data.activeSessions),
      sub: `${data.totalCalls.toLocaleString()} total calls`,
      col: 'var(--mist)',
    },
    {
      k: 'Calls / hr',
      v: String(callsPerHour),
      sub: `${lookback} window`,
      col: 'var(--fog)',
    },
    {
      k: 'Cache hit ratio',
      v: `${data.cacheHitPct.toFixed(1)}%`,
      sub: `target 40%`,
      spark: sparkPoints,
      col: 'var(--accent-2)',
    },
    {
      k: 'Error rate',
      v: `${data.errorRatePct.toFixed(2)}%`,
      sub: data.errorRatePct > 1 ? 'above threshold' : 'nominal',
      col: data.errorRatePct > 1 ? 'var(--warn)' : 'var(--good)',
    },
    {
      k: 'Latency p50',
      v: data.avgLatencyMs > 0 ? fmtMs(data.p50LatMs) : '—',
      sub: `p99 ${data.p99LatMs > 0 ? fmtMs(data.p99LatMs) : '—'}`,
      col: 'var(--fog)',
    },
    {
      k: 'Reasoning ratio',
      v: reasoningRatio > 0 ? reasoningRatio.toFixed(2) : data.efficiency.toFixed(2),
      sub: 'tokens thought',
      col: 'var(--steel)',
    },
  ];

  return (
    <div className="card" style={{ padding: 0, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 12 }}>
      {stats.map((s, i) => (
        <div key={s.k} style={{
          padding: '14px 16px',
          borderRight: i < stats.length - 1 ? '1px solid var(--line)' : 'none',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div className="label">{s.k}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
            <span className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.01em', color: s.col ?? 'var(--mist)' }}>
              {s.v}
            </span>
            {s.spark && s.spark.length >= 2 && (
              <Sparkline data={s.spark} color="#6FA8B3" w={58} h={22} />
            )}
          </div>
          <div className="label" style={{ color: 'var(--graphite)', fontSize: 9 }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
