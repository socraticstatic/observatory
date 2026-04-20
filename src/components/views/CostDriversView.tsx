'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Lookback } from '@/lib/lookback';

type Dim = 'taskType' | 'template' | 'toolCall' | 'tokenClass' | 'surface' | 'model';

const DIM_LABELS: Record<Dim, string> = {
  taskType:   'Task type',
  template:   'Template',
  toolCall:   'Tool call',
  tokenClass: 'Token class',
  surface:    'App surface',
  model:      'Model',
};

const PALETTE = [
  '#6FA8B3', '#9BC4CC', '#B88A8A', '#C9B08A', '#4F7B83',
  '#7CA893', '#C9966B', '#8A9AB8', '#9AB88A', '#B8A88A',
];

interface DimRow {
  key:      string;
  costUsd:  number;
  pctShare: number;
  delta7d:  number;
  sub:      string;
}

function DeltaBadge({ v }: { v: number }) {
  const color = v > 0.15 ? '#B86B6B' : v > 0 ? '#C9966B' : '#7CA893';
  return (
    <span className="num" style={{ color, fontSize: 11 }}>
      {v >= 0 ? '+' : ''}{(v * 100).toFixed(0)}%
    </span>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 0.001);
  return (
    <div style={{ display: 'flex', gap: 2, height: 64, alignItems: 'flex-end' }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(v / max) * 100}%`,
            background: `linear-gradient(180deg, ${color}, ${color}AA)`,
            borderRadius: '1px 1px 0 0',
            minHeight: v > 0 ? 2 : 0,
          }}
        />
      ))}
    </div>
  );
}

interface DrillPanelProps {
  dim:   Dim;
  row:   DimRow;
  color: string;
  rank:  number;
  total: number;
}

function DrillPanel({ dim, row, color, rank, total }: DrillPanelProps) {
  const { data: histRaw } = trpc.costDrivers.history.useQuery({ dim, key: row.key });

  const history = useMemo(() => {
    if (!histRaw?.length) return new Array(30).fill(0);
    // Build a 30-slot array keyed by relative day index
    const map = new Map(histRaw.map(r => [r.day, r.costUsd]));
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      return map.get(key) ?? 0;
    });
  }, [histRaw]);

  const rec = getRec(dim, row);

  return (
    <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Title */}
      <div>
        <div className="label">{DIM_LABELS[dim]} · drill</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--mist)', marginTop: 4 }}>{row.key}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 2 }}>{row.sub || '\u2014'}</div>
      </div>

      {/* Sparkline */}
      <div>
        <div className="label" style={{ marginBottom: 4 }}>Daily spend · 30 days</div>
        <Sparkline data={history} color={color} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--steel)', marginTop: 4 }}>
          <span>D-30</span><span>D-20</span><span>D-10</span><span>today</span>
        </div>
      </div>

      {/* Metric tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'Spend',         val: `$${row.costUsd.toFixed(2)}`,                          color: 'var(--mist)' },
          { label: '\u0394 vs prior 7d', val: `${row.delta7d >= 0 ? '+' : ''}${(row.delta7d * 100).toFixed(0)}%`, color: row.delta7d > 0.15 ? '#B86B6B' : row.delta7d > 0 ? '#C9966B' : '#7CA893' },
          { label: 'Share of total', val: `${Math.round(row.pctShare * 100)}%`,                 color: 'var(--mist)' },
          { label: 'Rank',           val: `#${rank} / ${total}`,                                color: 'var(--mist)' },
        ].map(t => (
          <div key={t.label} style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.2)' }}>
            <div className="label" style={{ fontSize: 9 }}>{t.label}</div>
            <div className="num" style={{ fontSize: 18, color: t.color, marginTop: 2 }}>{t.val}</div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div style={{ padding: 10, border: '1px solid rgba(111,168,179,.3)', borderRadius: 'var(--r)', background: 'rgba(111,168,179,.04)', marginTop: 'auto' }}>
        <div className="label" style={{ color: 'var(--accent-2)' }}>Recommendation</div>
        <div style={{ fontSize: 11, color: 'var(--fog)', marginTop: 4, lineHeight: 1.5 }}>
          {rec}
        </div>
        <button
          className="mbtn primary"
          style={{ marginTop: 8 }}
          onClick={() => {/* TODO: open traces filtered to this key */}}
        >
          Open related traces &#9654;
        </button>
      </div>
    </div>
  );
}

function getRec(dim: Dim, row: DimRow): string {
  if (row.delta7d > 0.4) return `${row.key} is up ${(row.delta7d * 100).toFixed(0)}% this week. Investigate what changed — a new script or prompt template may be running more frequently than expected.`;
  if (row.pctShare > 0.5) return `${row.key} is more than half your spend. Any optimization here has outsized impact. Consider caching, routing to a cheaper model, or adding a step budget.`;
  if (row.delta7d < -0.15) return `${row.key} is trending down ${Math.abs(row.delta7d * 100).toFixed(0)}% this week. Keep doing what's working.`;
  if (dim === 'model' && row.pctShare > 0.3) return `If quality scores on ${row.key} are above 90, consider shadow-scoring a cheaper model on lower-complexity requests to find routing opportunities.`;
  if (dim === 'surface') return `Monitor ${row.key} for runaway sessions. A per-surface daily budget cap prevents unexpected blowouts.`;
  if (dim === 'tokenClass' && row.key === 'Reasoning') return 'Extended thinking tokens are priced at output rates. Disable extended thinking for routine completions and reserve it for reasoning-hard tasks.';
  if (dim === 'tokenClass' && row.key.startsWith('Cached')) return 'Cached tokens cost 10\u00d7 less than input. Warm-start more templates to increase cache hit rate.';
  return `Within expected range for the selected lookback window. No immediate action needed.`;
}

interface BudgetStripProps {
  lookback: Lookback;
}

function BudgetStrip({ lookback: _ }: BudgetStripProps) {
  const { data: ms } = trpc.costDrivers.monthSummary.useQuery();
  if (!ms) return null;

  const { mtdCost, projectedEOM, lastMonthCost, budget, dayOfMonth, daysInMonth } = ms;
  const mtdPct = Math.min((mtdCost / budget) * 100, 100);
  const capDelta = projectedEOM - budget;
  const vsLastPct = lastMonthCost > 0 ? ((projectedEOM - lastMonthCost) / lastMonthCost) * 100 : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 16, marginTop: 16 }}>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="label">Month-to-date</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <span className="num" style={{ fontSize: 24, fontWeight: 600 }}>${mtdCost.toFixed(2)}</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>/ ${budget.toLocaleString()}</span>
        </div>
        <div style={{ height: 4, background: 'var(--ink)', marginTop: 8, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${mtdPct}%`, height: '100%', background: 'linear-gradient(90deg,#6FA8B3,#9BC4CC)' }} />
        </div>
        <div className="label" style={{ marginTop: 4, color: 'var(--graphite)' }}>
          {mtdPct.toFixed(1)}% · day {dayOfMonth} of {daysInMonth}
        </div>
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="label">Projected EOM</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <span className="num" style={{ fontSize: 24, fontWeight: 600, color: projectedEOM < budget ? 'var(--good)' : '#C9966B' }}>
            ${projectedEOM.toFixed(0)}
          </span>
          <span className="mono" style={{ fontSize: 11, color: capDelta <= 0 ? 'var(--good)' : '#C9966B' }}>
            {capDelta >= 0 ? '+' : '-'}${Math.abs(capDelta).toFixed(0)} vs cap
          </span>
        </div>
        <div className="label" style={{ marginTop: 8, color: 'var(--graphite)' }}>linear extrapolation · last {dayOfMonth}d</div>
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="label">vs last month</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <span className="num" style={{ fontSize: 24, fontWeight: 600, color: vsLastPct > 0 ? '#C9966B' : 'var(--good)' }}>
            {vsLastPct >= 0 ? '+' : ''}{vsLastPct.toFixed(0)}%
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>
            ${projectedEOM.toFixed(0)} vs ${lastMonthCost.toFixed(0)}
          </span>
        </div>
        <div className="label" style={{ marginTop: 8, color: 'var(--graphite)' }}>projected vs actual prior month</div>
      </div>
    </div>
  );
}

interface Props {
  lookback: Lookback;
}

export function CostDriversView({ lookback }: Props) {
  const [dim, setDim] = useState<Dim>('model');
  const [sel, setSel] = useState(0);

  const { data: rows = [] } = trpc.costDrivers.attribution.useQuery({ dim, lookback });

  const safeRows: DimRow[] = rows.length ? rows : [];
  const selRow = safeRows[sel] ?? safeRows[0];
  const selColor = PALETTE[sel % PALETTE.length];

  const totalCost = safeRows.reduce((a, r) => a + r.costUsd, 0);

  function switchDim(d: Dim) {
    setDim(d);
    setSel(0);
  }

  return (
    <>
      <div className="card" style={{ marginTop: 0, padding: 0 }}>
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
            {(Object.entries(DIM_LABELS) as [Dim, string][]).map(([k, label]) => (
              <button key={k} className={dim === k ? 'on' : ''} onClick={() => switchDim(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {safeRows.length === 0 ? (
          <div style={{ padding: '40px 32px', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--steel)' }}>No data for this lookback window.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)' }}>
            {/* LEFT — contributor list */}
            <div style={{ borderRight: '1px solid var(--line)' }}>
              {/* Treemap bar */}
              <div style={{ padding: '14px 18px 8px', display: 'flex', height: 46, borderBottom: '1px solid var(--line)' }}>
                {safeRows.map((r, i) => {
                  const color = PALETTE[i % PALETTE.length];
                  return (
                    <div
                      key={r.key}
                      onClick={() => setSel(i)}
                      title={r.key}
                      style={{
                        width: `${r.pctShare * 100}%`,
                        background: `linear-gradient(180deg, ${color}, ${color}BB)`,
                        borderRight: i < safeRows.length - 1 ? '1px solid rgba(0,0,0,.4)' : 'none',
                        borderRadius: i === 0 ? '2px 0 0 2px' : i === safeRows.length - 1 ? '0 2px 2px 0' : 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: sel === i ? 'inset 0 0 0 1.5px #E9ECEC' : 'none',
                        transition: 'box-shadow 160ms ease-out',
                        minWidth: 4,
                      }}
                    >
                      {r.pctShare > 0.08 && (
                        <span className="mono" style={{ fontSize: 10, color: '#11171B', fontWeight: 600 }}>
                          {Math.round(r.pctShare * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Table */}
              <table>
                <thead>
                  <tr>
                    <th>Contributor</th>
                    <th>Spend</th>
                    <th>Share</th>
                    <th>&#916; 7d</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {safeRows.map((r, i) => {
                    const color = PALETTE[i % PALETTE.length];
                    return (
                      <tr
                        key={r.key}
                        className={sel === i ? 'selected' : ''}
                        onClick={() => setSel(i)}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, background: color, borderRadius: 1, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--mist)', fontSize: 12 }}>{r.key}</div>
                              {r.sub && (
                                <div className="label" style={{ fontSize: 9, marginTop: 2, color: 'var(--graphite)' }}>{r.sub}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="num" style={{ color: 'var(--mist)' }}>${r.costUsd.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 40, height: 3, background: 'var(--ink)' }}>
                              <div style={{ width: `${r.pctShare * 100}%`, height: '100%', background: color }} />
                            </div>
                            <span className="num" style={{ fontSize: 11, color: 'var(--fog)' }}>
                              {Math.round(r.pctShare * 100)}%
                            </span>
                          </div>
                        </td>
                        <td><DeltaBadge v={r.delta7d} /></td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: 'var(--graphite)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
                            {sel === i ? '◀' : '›'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ color: 'var(--steel)', letterSpacing: '.1em', fontSize: 10, textTransform: 'uppercase' }}>Total</td>
                    <td className="num" style={{ color: 'var(--mist)', fontWeight: 600 }}>${totalCost.toFixed(2)}</td>
                    <td /><td /><td />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* RIGHT — drill detail */}
            {selRow && <DrillPanel dim={dim} row={selRow} color={selColor} rank={sel + 1} total={safeRows.length} />}
          </div>
        )}
      </div>

      <BudgetStrip lookback={lookback} />
    </>
  );
}
