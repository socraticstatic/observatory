'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc-client';
import { fmtUsd, fmtMs } from '@/lib/fmt';
import type { Lookback } from '@/lib/lookback';
import { ViewStatusBar } from '@/components/shared/ViewStatusBar';

interface Props { lookback: Lookback; onNavigate?: (view: string) => void; provider?: string; }

const DIMS = [
  { key: 'provider'    as const, label: 'Provider' },
  { key: 'model'       as const, label: 'Model' },
  { key: 'surface'     as const, label: 'Surface' },
  { key: 'project'     as const, label: 'Project' },
  { key: 'contentType' as const, label: 'Content' },
  { key: 'region'      as const, label: 'Region' },
  { key: 'user'        as const, label: 'User' },
  { key: 'prompt'      as const, label: 'Prompt' },
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

export function CostDriversView({ lookback, onNavigate, provider }: Props) {
  const [dimIdx, setDimIdx] = useState(0);
  const [sel, setSel] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isFetching } = trpc.costDrivers.sixDimension.useQuery({ lookback, provider });
  const { data: baseline }   = trpc.costDrivers.baseline.useQuery({ lookback, provider });
  const { data: insights }   = trpc.insights.whyInsights.useQuery({ provider });

  const dim   = DIMS[dimIdx];
  const items = useMemo<DimItem[]>(() => {
    if (!data) return [];
    return data[dim.key] as DimItem[];
  }, [data, dim.key]);

  const selItem = items[sel] ?? null;

  const handleRowClick = useCallback((i: number, label: string) => {
    setSel(i);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(`${label} — drill-down to Sessions view →`);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  return (
    <>
      <ViewStatusBar lookback={lookback} provider={provider} />
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
            <div style={{ borderRight: '1px solid var(--line)', position: 'relative' }}>
              {/* Treemap bar */}
              <div style={{ padding: '14px 18px 8px', display: 'flex', height: 46, borderBottom: '1px solid var(--line)' }}>
                {items.map((r, i) => (
                  <div key={r.label} onClick={() => handleRowClick(i, r.label)}
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
                    <tr key={r.label} className={sel === i ? 'selected' : ''} onClick={() => handleRowClick(i, r.label)}>
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

              {/* Toast: appears on row click, fades after 2s */}
              {toast && (
                <div style={{
                  position: 'absolute', bottom: 12, left: 12, right: 12,
                  padding: '7px 12px',
                  background: 'rgba(17,23,27,.92)',
                  border: '1px solid rgba(111,168,179,.4)',
                  borderRadius: 'var(--r)',
                  fontSize: 11, color: 'var(--accent-2)',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '.04em',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}>
                  <span>{toast}</span>
                </div>
              )}
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

                {/* Insight — rule-based, matched to selected item */}
                {(() => {
                  const label = selItem.label.toLowerCase();
                  const matched = (insights ?? []).find(ins =>
                    ins.title.toLowerCase().includes(label) ||
                    ins.detail.toLowerCase().includes(label)
                  );
                  const latencyFlag = selItem.p95LatMs && selItem.p95LatMs > 3000;
                  const dominantFlag = selItem.pct > 50;

                  const insightText = matched
                    ? matched.detail
                    : dominantFlag
                      ? `${selItem.label} is ${Math.round(selItem.pct)}% of spend in this window.`
                      : latencyFlag
                        ? `p95 latency ${fmtMs(selItem.p95LatMs!)} — check for large contexts or retries.`
                        : null;

                  const sevColor = matched?.severity === 'warn' ? '#C9966B'
                    : matched?.severity === 'info' ? 'var(--steel)'
                    : 'var(--accent-2)';

                  return (
                    <div style={{ padding: 10, border: `1px solid ${insightText ? 'rgba(201,150,107,.3)' : 'rgba(111,168,179,.2)'}`, borderRadius: 'var(--r)', background: 'rgba(0,0,0,.15)', marginTop: 'auto' }}>
                      <div className="label" style={{ color: sevColor }}>
                        {matched ? `${matched.severity.toUpperCase()} · ${matched.title}` : 'Insight'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fog)', marginTop: 4, lineHeight: 1.5 }}>
                        {insightText ?? 'No active findings for this contributor.'}
                      </div>
                      {matched?.recommendation && (
                        <div style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 4 }}>
                          → {matched.recommendation}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <button className="mbtn primary" onClick={() => onNavigate?.('Sessions')}>Sessions ▸</button>
                        <button className="mbtn" onClick={() => onNavigate?.('Intel')}>Intel ▸</button>
                      </div>
                    </div>
                  );
                })()}
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
