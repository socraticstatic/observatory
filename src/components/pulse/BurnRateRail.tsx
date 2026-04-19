'use client';

import { type Lookback } from '@/lib/lookback';
import { trpc } from '@/lib/trpc-client';

interface Props {
  lookback: Lookback;
}

const BUDGET = 200;
const SPENT  = 42.18;
const UTIL   = SPENT / BUDGET;

export function BurnRateRail({ lookback: _lookback }: Props) {
  const { data } = trpc.pulse.burnRate.useQuery();
  const todayCost = data?.todayCost ?? SPENT;
  const projected = data?.projected ?? 58.40;
  const runway = data?.runway ?? 18.2;
  const utilPct = data ? Math.round(data.utilPct) : Math.round(UTIL * 100);
  const budget = data?.budget ?? BUDGET;
  const deltaText = data
    ? `${data.deltaVsYesterday > 0 ? '+' : ''}${data.deltaVsYesterday.toFixed(0)}% vs yesterday`
    : '+8% vs yesterday';

  return (
    <div
      className="card"
      style={{
        marginBottom: 12,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        overflow: 'hidden',
      }}
    >
      {/* Today pace */}
      <div
        style={{
          padding: '14px 18px',
          borderRight: '1px solid var(--line)',
        }}
      >
        <div className="label" style={{ marginBottom: 6 }}>Today pace</div>
        <div
          className="mono"
          style={{ fontSize: 22, fontWeight: 700, color: 'var(--mist)', lineHeight: 1, marginBottom: 4 }}
        >
          ${todayCost.toFixed(2)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--warn)' }}>{deltaText}</div>
      </div>

      {/* Projected */}
      <div
        style={{
          padding: '14px 18px',
          borderRight: '1px solid var(--line)',
        }}
      >
        <div className="label" style={{ marginBottom: 6 }}>Projected</div>
        <div
          className="mono"
          style={{ fontSize: 18, fontWeight: 600, color: 'var(--fog)', lineHeight: 1, marginBottom: 4 }}
        >
          ${projected.toFixed(2)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>per day at current rate</div>
      </div>

      {/* Runway */}
      <div
        style={{
          padding: '14px 18px',
          borderRight: '1px solid var(--line)',
        }}
      >
        <div className="label" style={{ marginBottom: 6 }}>Runway</div>
        <div
          className="mono"
          style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent)', lineHeight: 1, marginBottom: 4 }}
        >
          {runway.toFixed(1)} days
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>at current pace</div>
      </div>

      {/* Budget utilization */}
      <div style={{ padding: '14px 18px' }}>
        <div className="label" style={{ marginBottom: 6 }}>Budget util</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
          <span
            className="mono"
            style={{ fontSize: 18, fontWeight: 600, color: 'var(--mist)', lineHeight: 1 }}
          >
            {utilPct}%
          </span>
          <span style={{ fontSize: 10, color: 'var(--steel)' }}>of ${budget}</span>
        </div>

        {/* Budget bar */}
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: 'var(--line)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${utilPct}%`,
              borderRadius: 3,
              background: 'linear-gradient(90deg, var(--good), #6FA88A)',
              transition: 'width .4s ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--graphite)' }}>$0</span>
          <span style={{ fontSize: 9, color: 'var(--graphite)' }}>${budget}</span>
        </div>
      </div>
    </div>
  );
}
