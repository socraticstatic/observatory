'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { fmtUsd, fmtMs } from '@/lib/fmt';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function nDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function providerDot(p: string): string {
  if (p === 'anthropic') return '#D97757';
  if (p === 'google')    return '#8BA89C';
  if (p === 'xai')       return '#B88A8A';
  return '#7A7068';
}

function fmt2(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtDay(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const DATE_INPUT_STYLE: React.CSSProperties = {
  background: 'var(--ink-2)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r)',
  padding: '5px 8px',
  fontSize: 11,
  color: 'var(--fog)',
  outline: 'none',
  fontFamily: "'JetBrains Mono', monospace",
  colorScheme: 'dark',
};

interface DailyEntry { day: string; cost: number; calls: number; }

function DailyChart({ daily }: { daily: DailyEntry[] }) {
  if (daily.length < 2) return null;
  const maxCost = Math.max(...daily.map(d => d.cost), 0.001);
  const W = 800, H = 56;
  const colW = W / daily.length;
  const barW = Math.max(1, colW * 0.72);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 56, display: 'block' }}
      preserveAspectRatio="none"
    >
      {daily.map((d, i) => {
        const h  = Math.max(2, (d.cost / maxCost) * (H - 6));
        const x  = i * colW + (colW - barW) / 2;
        return (
          <rect
            key={d.day}
            x={x} y={H - h}
            width={barW} height={h}
            fill="var(--accent)" opacity={0.6} rx={1}
          />
        );
      })}
    </svg>
  );
}

interface BreakdownItem { label: string; cost: number; calls: number; color?: string; }

function BreakdownPanel({ title, items, total }: {
  title: string;
  items: BreakdownItem[];
  total: number;
}) {
  return (
    <div className="card" style={{ padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div className="label" style={{ marginBottom: 12 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--graphite)', padding: '12px 0', textAlign: 'center' }}>
          No data
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {items.map(item => {
            const pct = total > 0 ? (item.cost / total) * 100 : 0;
            return (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                  <span style={{
                    fontSize: 11, color: 'var(--fog)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {item.color && (
                      <span style={{
                        display: 'inline-block', width: 7, height: 7,
                        borderRadius: '50%', background: item.color, flexShrink: 0,
                      }} />
                    )}
                    {item.label}
                  </span>
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>
                      {fmt2(item.calls)}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--mist)', minWidth: 52, textAlign: 'right' }}>
                      {fmtUsd(item.cost)}
                    </span>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--steel)', minWidth: 34, textAlign: 'right' }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div style={{ height: 2, background: 'var(--line)', borderRadius: 1 }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(pct, 100)}%`,
                    background: item.color ?? 'var(--accent)',
                    borderRadius: 1,
                    transition: 'width 500ms ease-out',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PRESETS = [
  { label: '7D',  n: 7   },
  { label: '30D', n: 30  },
  { label: '90D', n: 90  },
  { label: '1Y',  n: 365 },
];

export function ArchiveView() {
  const [from,  setFrom]  = useState(nDaysAgoStr(30));
  const [to,    setTo]    = useState(todayStr());
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null);

  const { data, isFetching } = trpc.archive.summary.useQuery(
    { from: query?.from ?? '', to: query?.to ?? '' },
    { enabled: !!query },
  );

  function runQuery(f = from, t = to) {
    setQuery({ from: f, to: t });
  }

  function applyPreset(n: number) {
    const f = nDaysAgoStr(n);
    const t = todayStr();
    setFrom(f);
    setTo(t);
    runQuery(f, t);
  }

  const statCell: React.CSSProperties = {
    flex: 1, padding: '14px 18px',
    display: 'flex', flexDirection: 'column', gap: 5,
    borderRight: '1px solid var(--line)',
  };

  return (
    <div className="page">

      {/* Date range controls */}
      <div className="card" style={{ padding: '13px 18px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="label">Archive range</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="label" style={{ fontSize: 9 }}>From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={e => setFrom(e.target.value)}
              style={DATE_INPUT_STYLE}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="label" style={{ fontSize: 9 }}>To</span>
            <input
              type="date"
              value={to}
              min={from}
              max={todayStr()}
              onChange={e => setTo(e.target.value)}
              style={DATE_INPUT_STYLE}
            />
          </div>

          {/* Preset buttons */}
          <div className="seg">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p.n)}>{p.label}</button>
            ))}
          </div>

          <button
            className="mbtn primary"
            onClick={() => runQuery()}
            disabled={isFetching}
            style={{ marginLeft: 'auto', opacity: isFetching ? 0.6 : 1 }}
          >
            {isFetching ? 'Querying…' : 'Query'}
          </button>
        </div>
      </div>

      {/* No query run yet */}
      {!query && (
        <div className="card" style={{ padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 6 }}>
            Select a date range and run a query
          </div>
          <div style={{ fontSize: 11, color: 'var(--graphite)' }}>
            Browse historical LLM events beyond the live lookback window
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {query && isFetching && !data && (
        <div className="card" style={{ padding: '40px 32px', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--steel)' }}>Querying archive…</span>
        </div>
      )}

      {/* Results */}
      {query && data && (
        <>
          {/* Stat row */}
          <div className="card" style={{ display: 'flex', marginBottom: 12, padding: 0, overflow: 'hidden' }}>
            <div style={statCell}>
              <div className="label" style={{ fontSize: 9 }}>Total cost</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--mist)', letterSpacing: '-.02em' }}>
                {fmtUsd(data.totalCostUsd)}
              </div>
            </div>
            <div style={statCell}>
              <div className="label" style={{ fontSize: 9 }}>Total calls</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--mist)', letterSpacing: '-.02em' }}>
                {fmt2(data.totalCalls)}
              </div>
            </div>
            <div style={statCell}>
              <div className="label" style={{ fontSize: 9 }}>Errors</div>
              <div className="mono" style={{
                fontSize: 22, fontWeight: 600, letterSpacing: '-.02em',
                color: data.errorCount > 0 ? 'var(--bad)' : 'var(--mist)',
              }}>
                {fmt2(data.errorCount)}
              </div>
            </div>
            <div style={statCell}>
              <div className="label" style={{ fontSize: 9 }}>Avg latency</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--mist)', letterSpacing: '-.02em' }}>
                {data.avgLatencyMs > 0 ? fmtMs(data.avgLatencyMs) : '—'}
              </div>
            </div>
            <div style={{ ...statCell, borderRight: 'none' }}>
              <div className="label" style={{ fontSize: 9 }}>Cache hit</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--mist)', letterSpacing: '-.02em' }}>
                {data.cacheHitPct.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Breakdowns */}
          {(data.byProvider.length > 0 || data.byModel.length > 0) && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <BreakdownPanel
                title="By Provider"
                items={data.byProvider.map(r => ({
                  label: r.provider, cost: r.cost, calls: r.calls,
                  color: providerDot(r.provider),
                }))}
                total={data.totalCostUsd}
              />
              <BreakdownPanel
                title="By Model"
                items={data.byModel.map(r => ({
                  label: r.model, cost: r.cost, calls: r.calls,
                }))}
                total={data.totalCostUsd}
              />
            </div>
          )}

          {/* Daily cost chart */}
          {data.daily.length > 1 && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div className="label">Daily cost</div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>
                    {data.daily.length} days
                  </span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--steel)' }}>
                    avg {fmtUsd(data.totalCostUsd / data.daily.length)}/day
                  </span>
                </div>
              </div>
              <DailyChart daily={data.daily} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>
                  {fmtDay(data.daily[0].day)}
                </span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>
                  {fmtDay(data.daily[data.daily.length - 1].day)}
                </span>
              </div>
            </div>
          )}

          {/* No events */}
          {data.totalCalls === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', fontSize: 12, color: 'var(--steel)' }}>
              No events found in this date range
            </div>
          )}
        </>
      )}

    </div>
  );
}
