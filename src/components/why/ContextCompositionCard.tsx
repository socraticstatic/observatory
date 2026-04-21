'use client';

import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

function fmtTok(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function ContextCompositionCard({ lookback }: { lookback: Lookback }) {
  const { data } = trpc.costDrivers.contextComposition.useQuery({ lookback });

  const segments = data?.segments ?? [];
  const total    = data?.totalTokens ?? 0;
  const isEmpty  = !data || total === 0;
  const topSeg   = [...segments].sort((a, b) => b.pct - a.pct)[0];

  return (
    <div className="card">
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label">CONTEXT</span>
            <span style={{ width: 14, height: 1, background: 'var(--line-2)' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>What you're paying to send</span>
          </div>
          <div className="label" style={{ marginTop: 4, color: 'var(--graphite)' }}>avg tokens per call, by origin</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '18px 20px' }}>
        {isEmpty ? (
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--steel)', padding: '12px 0' }}>
            No token data yet for this window.
          </div>
        ) : (
          <>
            {/* Big stacked horizontal bar */}
            <div style={{ display: 'flex', height: 42, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--line-2)' }}>
              {segments.map((seg, i) => {
                if (seg.pct <= 0) return null;
                return (
                  <div
                    key={seg.label}
                    title={`${seg.label}: ${fmtTok(seg.tokens)} (${Math.round(seg.pct)}%)`}
                    style={{
                      width: seg.pct + '%',
                      background: `linear-gradient(180deg, ${seg.color}, ${seg.color}CC)`,
                      borderRight: i < segments.length - 1 ? '1px solid rgba(0,0,0,.35)' : 'none',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'filter 160ms ease-out',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.filter = 'brightness(1.2)'}
                    onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.filter = 'none'}
                  >
                    {seg.pct > 8 && (
                      <span className="mono" style={{ fontSize: 10, color: '#11171B', fontWeight: 600, letterSpacing: '.06em' }}>
                        {Math.round(seg.pct)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Labels under bar */}
            <div style={{ display: 'flex', marginTop: 8 }}>
              {segments.map(seg => (
                seg.pct <= 0 ? null :
                <div key={seg.label} style={{ width: seg.pct + '%', display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 6 }}>
                  <span className="label" style={{ fontSize: 9, color: 'var(--steel)' }}>{seg.label}</span>
                  <span className="num" style={{ fontSize: 11, color: 'var(--fog)' }}>{fmtTok(seg.tokens)}</span>
                </div>
              ))}
            </div>

            {/* Diagnostic row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <div>
                <div className="label">Total tokens</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                  <span className="num" style={{ fontSize: 16, color: 'var(--mist)' }}>{fmtTok(total)}</span>
                </div>
              </div>
              <div>
                <div className="label">Biggest segment</div>
                <div style={{ fontSize: 12, color: 'var(--mist)', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                  {topSeg ? `${topSeg.label} · ${fmtTok(topSeg.tokens)}` : '—'}
                </div>
              </div>
              <div>
                <div className="label">Compression opportunity</div>
                <div style={{ fontSize: 12, color: 'var(--good)', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                  {topSeg ? `−${Math.round((1 - topSeg.pct / 100) * 30)}% feasible` : '—'}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
