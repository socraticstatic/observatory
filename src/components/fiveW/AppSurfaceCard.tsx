'use client';

import { fmt, fmtUsd, fmtMs } from '@/lib/fmt';

const SURFACES = [
  { id: 'desktop',    label: 'Desktop',    share: .42, cost: 14.22, tpm: 18240, p50: 612,  sessions: 8  },
  { id: 'api',        label: 'API',        share: .24, cost: 8.14,  tpm: 10440, p50: 284,  sessions: 12 },
  { id: 'vscode',     label: 'VS Code',    share: .18, cost: 6.10,  tpm: 7880,  p50: 342,  sessions: 4  },
  { id: 'cli',        label: 'CLI',        share: .09, cost: 3.06,  tpm: 3940,  p50: 502,  sessions: 6  },
  { id: 'mobile',     label: 'Mobile',     share: .04, cost: 1.36,  tpm: 1760,  p50: 840,  sessions: 2  },
  { id: 'automation', label: 'Automation', share: .03, cost: 1.02,  tpm: 1320,  p50: 920,  sessions: 3, flag: 'RUNAWAY' },
] as const;

const PALETTE = ['#D97757', '#C96442', '#C9B08A', '#B88A8A', '#7CA893', '#4F7B83'];

export function AppSurfaceCard() {
  return (
    <div className="card">
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>App Surface</span>
        <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>Where requests originate</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 0 }}>
        {/* Left: stacked bar */}
        <div style={{ padding: '18px 16px 18px 18px', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label">Share breakdown</div>
          {/* Horizontal stacked bar */}
          <div style={{ display: 'flex', height: 20, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
            {SURFACES.map((s, i) => (
              <div
                key={s.id}
                title={`${s.label}: ${Math.round(s.share * 100)}%`}
                style={{
                  flex: s.share,
                  background: PALETTE[i],
                  minWidth: s.share > 0.02 ? 4 : 0,
                }}
              />
            ))}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
            {SURFACES.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--fog)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{Math.round(s.share * 100)}%</span>
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
              {SURFACES.map((s, i) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i], flexShrink: 0 }} />
                      <span style={{ color: 'var(--mist)', fontWeight: 500 }}>{s.label}</span>
                      {'flag' in s && s.flag && (
                        <span style={{
                          display: 'inline-flex',
                          padding: '1px 6px',
                          borderRadius: 'var(--r)',
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: '.1em',
                          textTransform: 'uppercase',
                          color: 'var(--bad)',
                          background: 'rgba(184,107,107,.1)',
                          border: '1px solid rgba(184,107,107,.25)',
                        }}>
                          {s.flag}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 40, height: 3, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${s.share * 100}%`, height: '100%', background: PALETTE[i], opacity: 0.8, borderRadius: 2 }} />
                      </div>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{Math.round(s.share * 100)}%</span>
                    </div>
                  </td>
                  <td className="mono" style={{ color: s.cost > 10 ? 'var(--accent-2)' : 'var(--fog)', fontSize: 11 }}>
                    {fmtUsd(s.cost)}
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{fmt(s.tpm)}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{fmtMs(s.p50)}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>{s.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
