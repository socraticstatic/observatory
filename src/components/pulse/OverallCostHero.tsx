'use client';

import { fmtUsd, fmtMs } from '@/lib/fmt';
import { LOOKBACKS, type Lookback } from '@/lib/lookback';
import { Sparkline } from '@/components/shared/Sparkline';
import { trpc } from '@/lib/trpc-client';

interface Props {
  lookback: Lookback;
}

// Savings per cached read token (Claude Sonnet pricing: ~$2.70/M savings vs input)
const CACHE_SAVINGS_PER_M = 2.70;

function fmtDelta(pct: number): { text: string; color: string } {
  if (Math.abs(pct) < 0.5) return { text: '±0%', color: 'var(--steel)' };
  const sign = pct > 0 ? '+' : '';
  const color = pct > 0 ? 'var(--warn)' : 'var(--good)';
  return { text: `${sign}${pct.toFixed(1)}%`, color };
}

export function OverallCostHero({ lookback }: Props) {
  const { data: costData }  = trpc.pulse.overallCost.useQuery({ lookback });
  const { data: burnData }  = trpc.pulse.burnRate.useQuery();
  const { data: chartData } = trpc.pulse.pulseChart.useQuery({ lookback });
  const { data: stripData } = trpc.pulse.statStrip.useQuery({ lookback });

  const total   = costData?.totalCostUsd ?? 0;
  const sparkData = chartData?.map(r => r.cost) ?? [];

  // Day-over-day trend — only meaningful for 24H; show nothing for other windows
  const delta = lookback === '24H' && burnData ? fmtDelta(burnData.deltaVsYesterday) : null;

  const pace   = burnData ? `$${burnData.todayCost.toFixed(2)} today` : '—';
  const proj   = burnData ? `$${(burnData.projected * 30).toFixed(0)}/mo` : '—';
  const runway = burnData ? `${burnData.runway.toFixed(1)} days` : '—';

  // Cache savings from real token data
  const cacheSavings = costData
    ? (costData.totalCachedTokens * CACHE_SAVINGS_PER_M) / 1_000_000
    : null;

  const errorPct = stripData?.errorRatePct ?? null;
  const latency  = stripData?.avgLatencyMs ?? null;

  return (
    <div
      className="card"
      style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px 1fr',
        }}
      >
        {/* Left — total cost */}
        <div style={{ padding: '18px 20px', borderRight: '1px solid var(--line)' }}>
          <div className="label" style={{ marginBottom: 8 }}>
            {LOOKBACKS[lookback].label} spend
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span
              className="mono"
              style={{ fontSize: 34, fontWeight: 700, color: 'var(--mist)', lineHeight: 1 }}
            >
              {fmtUsd(total)}
            </span>
            {delta && (
              <span
                className="mono"
                style={{ fontSize: 12, color: delta.color, fontWeight: 500 }}
                title="vs. yesterday"
              >
                {delta.text}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--steel)' }}>Today pace</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{pace}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--steel)' }}>Monthly proj</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{proj}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--steel)' }}>Runway</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{runway}</span>
            </div>
          </div>
        </div>

        {/* Center — sparkline */}
        <div
          style={{
            padding: '18px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRight: '1px solid var(--line)',
          }}
        >
          <div className="label" style={{ fontSize: 9 }}>{LOOKBACKS[lookback].label} activity</div>
          <Sparkline data={sparkData} color="var(--accent)" h={48} w={120} area />
        </div>

        {/* Right — real metrics */}
        <div
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <div>
            <div className="label" style={{ marginBottom: 3 }}>Cache savings</div>
            <div className="mono" style={{ fontSize: 15, color: 'var(--good)', fontWeight: 600 }}>
              {cacheSavings != null
                ? <>{fmtUsd(cacheSavings)}<span style={{ fontSize: 10, color: 'var(--steel)', fontWeight: 400 }}> est.</span></>
                : <span style={{ color: 'var(--graphite)' }}>—</span>
              }
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 3 }}>Error rate</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: errorPct != null && errorPct > 1 ? 'var(--warn)' : 'var(--good)' }}>
              {errorPct != null ? `${errorPct.toFixed(1)}%` : '—'}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 3 }}>Avg latency</div>
            <div className="mono" style={{ fontSize: 15, color: 'var(--fog)', fontWeight: 600 }}>
              {latency != null && latency > 0 ? fmtMs(latency) : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
