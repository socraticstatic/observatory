'use client';

import { fmtUsd, fmtMs } from '@/lib/fmt';
import { makeRng } from '@/lib/rng';
import { LOOKBACKS, type Lookback } from '@/lib/models';
import { Sparkline } from '@/components/shared/Sparkline';

interface Props {
  lookback: Lookback;
}

const LB_TOTAL: Record<Lookback, number> = {
  '1H':  1.76,
  '24H': 21.72,
  '30D': 651.60,
};

const LB_TREND: Record<Lookback, string> = {
  '1H':  '+4.2%',
  '24H': '+12.4%',
  '30D': '+8.1%',
};

const LB_PACE: Record<Lookback, string> = {
  '1H':  '$42.18/day pace',
  '24H': '$42.18 today',
  '30D': '$21.72/day avg',
};

const LB_PROJ: Record<Lookback, string> = {
  '1H':  '$1,265/mo',
  '24H': '$1,265/mo',
  '30D': '$651.60 this mo',
};

const LB_RUNWAY: Record<Lookback, string> = {
  '1H':  '18.2 days',
  '24H': '18.2 days',
  '30D': '5.8 days',
};

function buildSparkData(lookback: Lookback): number[] {
  const rng = makeRng(3);
  const { n, costMul } = LOOKBACKS[lookback];
  const base = 21.72 * costMul / n;
  return Array.from({ length: n }, (_, i) => {
    const trend = 1 + (i / n) * 0.18;
    return base * trend * (0.7 + rng() * 0.6);
  });
}

export function OverallCostHero({ lookback }: Props) {
  const total = LB_TOTAL[lookback];
  const trend = LB_TREND[lookback];
  const pace  = LB_PACE[lookback];
  const proj  = LB_PROJ[lookback];
  const runway = LB_RUNWAY[lookback];
  const data  = buildSparkData(lookback);

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
        {/* Left - total cost */}
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
            <span
              className="mono"
              style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 500 }}
            >
              {trend}
            </span>
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

        {/* Center - sparkline */}
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
          <Sparkline data={data} color="var(--accent)" h={48} w={120} area />
        </div>

        {/* Right - mini stats */}
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
              $8.42<span style={{ fontSize: 10, color: 'var(--steel)', fontWeight: 400 }}>/day</span>
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 3 }}>Error rate</div>
            <div className="mono" style={{ fontSize: 15, color: 'var(--warn)', fontWeight: 600 }}>0.4%</div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 3 }}>Avg latency</div>
            <div className="mono" style={{ fontSize: 15, color: 'var(--fog)', fontWeight: 600 }}>
              {fmtMs(612)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
