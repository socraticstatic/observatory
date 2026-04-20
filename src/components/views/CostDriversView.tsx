'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';
import { fmtUsd, fmtMs } from '@/lib/fmt';
import type { Lookback } from '@/lib/lookback';

interface Props { lookback: Lookback }

const DIMS = [
  { key: 'provider'    as const, label: 'Provider' },
  { key: 'model'       as const, label: 'Model' },
  { key: 'surface'     as const, label: 'Surface' },
  { key: 'project'     as const, label: 'Project' },
  { key: 'contentType' as const, label: 'Content' },
  { key: 'region'      as const, label: 'Region' },
];

interface DimItem {
  label: string;
  costUsd: number;
  pct: number;
  color: string;
  calls: number;
  sessions: number;
  avgLatMs: number | null;
  p95LatMs: number | null;
}

export function CostDriversView({ lookback }: Props) {
  const [dimIdx, setDimIdx] = useState(0);
  const [sel, setSel] = useState(0);

  const { data, isFetching } = trpc.costDrivers.sixDimension.useQuery({ lookback });
  const { data: baseline }   = trpc.costDrivers.baseline.useQuery();

  const dim   = DIMS[dimIdx];
  const items = useMemo<DimItem[]>(() => {
    if (!data) return [];
    return data[dim.key] as DimItem[];
  }, [data, dim.key]);

  const selItem = items[sel] ?? null;

  return (
    <>
      <div className="card" style={{ marginTop: 16, padding: 0 }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="label">COST DRIVERS</span>
              <span style={{ width: 14, height: 1, background: 'var(--line-2)' }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Six-way attribution</span>
            </div>
            <div className="label" style={{ marginTop: 4, color: 'var(--graphite)' }}>
              pick a dimension · drill into each contributor
            </div>
          </div>
          <div className="seg">
            {DIMS.map((d, i) => (
              <button key={d.key} className={dimIdx === i ? 'on' : ''} onClick={() => { setDimIdx(i); setSel(0); }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {isFetching && items.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--steel)' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--steel)' }}>No data for this window.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)' }}>
            {/* LEFT: treemap bar + table */}
            <div style={{ borderRight: '1px solid var(--line)' }}>
              {/* Treemap bar */}
              <div style={{ padding: '14px 18px 8px', display: 'flex', height: 46, borderBottom: '1px solid var(--line)' }}>
                {items.map((r, i) => (
                  <div key={r.label} onClick={() => setSel(i)}
                    style={{
                      width: `${r.pct}%`,
                      background: `linear-gradient(180deg,${r.color},${r.color}BB)`,
                      borderRight: i < items.length - 1 ? '1px solid rgba(0,0,0,.4)' : 'none',
                      borderRadius: i === 0 ? '2px 0 0 2px' : i === items.length - 1 ? '0 2px 2px 0' : 0,
                      cursor: 'pointer',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: sel === i ? 'inset 0 0 0 1.5px var(--mist)' : 'none',
                      transition: 'box-shadow 160ms ease-out',
                    }}>
                    {r.pct > 8 && (
                      <span className="mono" style={{ fontSize: 10, color: '#11171B', fontWeight: 600 }}>{Math.round(r.pct)}%</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Table */}
              <table>
                <thead>
                  <tr>
                    <th>Contributor</th>
                    <th>Spend</th>
                    <th>Share</th>
                    <th>Calls</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => (
                    <tr key={r.label} className={sel === i ? 'selected' : ''} onClick={() => setSel(i)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, background: r.color, borderRadius: 1, flexShrink: 0 }} />
                          <span className="mono" style={{ color: 'var(--mist)', fontSize: 11 }}>{r.label}</span>
                        </div>
                      </td>
                      <td className="num" style={{ color: 'var(--mist)' }}>{fmtUsd(r.costUsd)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 40, height: 3, background: 'var(--ink)', borderRadius: 1 }}>
                            <div style={{ width: `${r.pct}%`, height: '100%', background: r.color }} />
                          </div>
                          <span className="num" style={{ fontSize: 11, color: 'var(--fog)' }}>{Math.round(r.pct)}%</span>
                        </div>
                      </td>
                      <td className="mono" style={{ color: 'var(--steel)', fontSize: 10 }}>{r.calls.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ color: 'var(--graphite)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                          {sel === i ? '▾' : '▸'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ color: 'var(--steel)', letterSpacing: '.1em', fontSize: 10, textTransform: 'uppercase' }}>Total</td>
                    <td className="num" style={{ color: 'var(--mist)', fontWeight: 600 }}>
                      {fmtUsd(items.reduce((s, r) => s + r.costUsd, 0))}
                    </td>
                    <td /><td /><td />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* RIGHT: drill detail */}
            {selItem && (
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div className="label">{dim.label} · drill</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--mist)', marginTop: 4 }}>{selItem.label}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 2 }}>
                    {selItem.sessions} sessions · {selItem.calls} calls
                  </div>
                </div>

                {/* Metric tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.2)' }}>
                    <div className="label" style={{ fontSize: 9 }}>Spend</div>
                    <div className="num" style={{ fontSize: 18, color: 'var(--mist)', marginTop: 2 }}>{fmtUsd(selItem.costUsd)}</div>
                  </div>
                  <div style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.2)' }}>
                    <div className="label" style={{ fontSize: 9 }}>Share of total</div>
                    <div className="num" style={{ fontSize: 18, color: 'var(--mist)', marginTop: 2 }}>{Math.round(selItem.pct)}%</div>
                  </div>
                  <div style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.2)' }}>
                    <div className="label" style={{ fontSize: 9 }}>Avg latency</div>
                    <div className="num" style={{ fontSize: 18, color: 'var(--mist)', marginTop: 2 }}>
                      {selItem.avgLatMs != null ? fmtMs(selItem.avgLatMs) : '—'}
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.2)' }}>
                    <div className="label" style={{ fontSize: 9 }}>p95 latency</div>
                    <div className="num" style={{ fontSize: 18, color: selItem.p95LatMs && selItem.p95LatMs > 2000 ? '#C9966B' : 'var(--mist)', marginTop: 2 }}>
                      {selItem.p95LatMs != null ? fmtMs(selItem.p95LatMs) : '—'}
                    </div>
                  </div>
                </div>

                {/* Share bar */}
                <div>
                  <div className="label" style={{ marginBottom: 6, fontSize: 9 }}>Share of {dim.label} spend</div>
                  <div style={{ height: 6, background: 'var(--ink)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${selItem.pct}%`, height: '100%', background: `linear-gradient(90deg,${selItem.color},${selItem.color}AA)`, borderRadius: 3 }} />
                  </div>
                </div>

                {/* Recommendation */}
                <div style={{ padding: 10, border: '1px solid rgba(111,168,179,.3)', borderRadius: 'var(--r)', background: 'rgba(111,168,179,.04)', marginTop: 'auto' }}>
                  <div className="label" style={{ color: 'var(--accent-2)' }}>Insight</div>
                  <div style={{ fontSize: 11, color: 'var(--fog)', marginTop: 4, lineHeight: 1.5 }}>
                    {selItem.pct > 50
                      ? `${selItem.label} dominates at ${Math.round(selItem.pct)}% — consider routing optimizations.`
                      : selItem.p95LatMs && selItem.p95LatMs > 3000
                        ? `p95 latency of ${fmtMs(selItem.p95LatMs)} is elevated. Check for retries or large contexts.`
                        : 'Within expected range. No action needed.'}
                  </div>
                  <button className="mbtn primary" style={{ marginTop: 8 }}>Open related traces ▸</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Budget / forecast strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="label">Daily spend</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span className="num" style={{ fontSize: 24, fontWeight: 600 }}>
              {baseline ? fmtUsd(baseline.dailyCostUsd) : '—'}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--ink)', marginTop: 8, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (baseline?.dailyCostUsd ?? 0) / 200 * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#6FA8B3,#9BC4CC)' }} />
          </div>
          <div className="label" style={{ marginTop: 4, color: 'var(--graphite)' }}>last 24 hours</div>
        </div>

        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="label">Opus share</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span className="num" style={{ fontSize: 24, fontWeight: 600, color: baseline && baseline.opusSharePct > 60 ? '#C9966B' : 'var(--mist)' }}>
              {baseline ? `${baseline.opusSharePct}%` : '—'}
            </span>
          </div>
          <div className="label" style={{ marginTop: 8, color: 'var(--graphite)' }}>of 24h spend · routing candidate</div>
        </div>

        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="label">Cache depth</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span className="num" style={{ fontSize: 24, fontWeight: 600, color: baseline && baseline.cacheDepthPct > 40 ? 'var(--good)' : 'var(--mist)' }}>
              {baseline ? `${baseline.cacheDepthPct}%` : '—'}
            </span>
          </div>
          <div className="label" style={{ marginTop: 8, color: 'var(--graphite)' }}>tokens served from cache</div>
        </div>
      </div>
    </>
  );
}
