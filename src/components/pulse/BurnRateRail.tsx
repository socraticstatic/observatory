'use client';

import { type Lookback } from '@/lib/lookback';
import { trpc } from '@/lib/trpc-client';

interface Props {
  lookback: Lookback;
}

export function BurnRateRail({ lookback: _lookback }: Props) {
  const { data } = trpc.pulse.burnRate.useQuery();
  const todayCost = data?.todayCost;
  const projected = data?.projected;
  const runway = data?.runway;
  const utilPct = data ? Math.round(data.utilPct) : null;
  const budget = data?.budget ?? 200;
  const deltaText = data
    ? `${data.deltaVsYesterday > 0 ? '+' : ''}${data.deltaVsYesterday.toFixed(0)}% vs yesterday`
    : null;

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
          {todayCost != null ? `$${todayCost.toFixed(2)}` : '—'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--warn)' }}>{deltaText ?? ''}</div>
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
          {projected != null ? `$${projected.toFixed(2)}` : '—'}
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
          {runway != null ? `${runway.toFixed(1)} days` : '—'}
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
            {utilPct != null ? `${utilPct}%` : '—'}
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
              width: `${utilPct ?? 0}%`,
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
