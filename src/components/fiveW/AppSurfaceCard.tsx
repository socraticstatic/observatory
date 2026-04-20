'use client';

import { fmt, fmtUsd, fmtMs } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const PALETTE = ['#6FA8B3', '#9BC4CC', '#C9B08A', '#B88A8A', '#7CA893', '#4F7B83'];

const LOOKBACK_MINUTES: Record<Lookback, number> = {
  '1H':  60,
  '24H': 1440,
  '30D': 43200,
};

interface Props {
  lookback?: Lookback;
}

export function AppSurfaceCard({ lookback = '24H' }: Props) {
  const { data: raw } = trpc.surface.appSurface.useQuery({ lookback });

  if (!raw || raw.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
      </div>
    );
  }

  const minutes = LOOKBACK_MINUTES[lookback];

  return (
    <div className="card">
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>App Surface</span>
        <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>Where requests originate</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 0 }}>
        {/* Left: stacked bar */}
        <div style={{ padding: '18px 16px 18px 18px', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label">Share breakdown</div>
          <div style={{ display: 'flex', height: 20, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
            {raw.map((s, i) => (
              <div
                key={s.id}
                title={`${s.label}: ${Math.round(s.sharePct)}%`}
                style={{
                  flex: s.sharePct,
                  background: PALETTE[i % PALETTE.length],
                  minWidth: s.sharePct > 2 ? 4 : 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
            {raw.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--fog)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{Math.round(s.sharePct)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: table */}
        <div style={{ overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Surface</th>
                <th>Share</th>
                <th>Cost</th>
                <th>TPM</th>
                <th>p50</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {raw.map((s, i) => {
                const tpm = minutes > 0 ? s.calls / minutes : 0;
                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                        <span style={{ color: 'var(--mist)', fontWeight: 500 }}>{s.label}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 40, height: 3, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(s.sharePct, 100)}%`, height: '100%', background: PALETTE[i % PALETTE.length], opacity: 0.8, borderRadius: 2 }} />
                        </div>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{Math.round(s.sharePct)}%</span>
                      </div>
                    </td>
                    <td className="mono" style={{ color: s.costUsd > 10 ? 'var(--accent-2)' : 'var(--fog)', fontSize: 11 }}>
                      {fmtUsd(s.costUsd)}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{fmt(tpm)}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{fmtMs(s.p50LatMs)}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>{s.sessions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
