'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';

interface Attribution {
  label: string;
  pct: number;
  col: string;
}

interface Insight {
  id: string;
  severity: 'bad' | 'warn' | 'info';
  title: string;
  detail: string;
  attribution?: Attribution[];
  rec: string;
  drillTarget: string;
}

const SEV_COLOR = {
  bad:  '#B86B6B',
  warn: '#C9966B',
  info: '#87867F',
} as const;

const SEV_BG = {
  bad:  'rgba(184,107,107,.07)',
  warn: 'rgba(201,150,107,.07)',
  info: 'rgba(135,134,127,.04)',
} as const;

interface Props {
  provider?: string;
}

function AttributionBar({ bars }: { bars: Attribution[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', height: 6, width: 80, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
        {bars.map(b => (
          <div
            key={b.label}
            style={{ flex: b.pct, background: b.col, opacity: 0.8 }}
            title={`${b.label}: ${Math.round(b.pct * 100)}%`}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {bars.map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: b.col }} />
            <span style={{ fontSize: 9, color: 'var(--steel)', letterSpacing: '.05em' }}>
              {b.label} {Math.round(b.pct * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeSev(s: string): 'bad' | 'warn' | 'info' {
  if (s === 'bad' || s === 'warn' || s === 'info') return s;
  if (s === 'critical' || s === 'error') return 'bad';
  if (s === 'warning') return 'warn';
  return 'info';
}

export function WhyInsightsCard({ provider }: { provider?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: insightData, isLoading } = trpc.insights.whyInsights.useQuery({ provider });

  const insights = useMemo<Insight[]>(() => {
    if (!insightData) return [];
    return insightData.map(r => ({
      id: r.id,
      severity: normalizeSev(r.severity),
      title: r.title,
      detail: r.detail ?? '',
      rec: r.recommendation,
      drillTarget: 'HowCard',
    }));
  }, [insightData]);

  if (isLoading) return (
    <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
      <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
    </div>
  );

  if (insights.length === 0) return (
    <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--good)' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fog)' }}>No anomalies detected</span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--graphite)', textAlign: 'center', maxWidth: 320 }}>
        Cache hit rate and routing look healthy over the past 7 days. Run more traffic to surface routing opportunities.
      </span>
    </div>
  );

  return (
    <div className="card">
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>WHY</span>
        <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>Insights & Anomalies</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {(['bad', 'warn', 'info'] as const).map(s => {
            const count = insights.filter(i => i.severity === s).length;
            return count > 0 ? (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: SEV_COLOR[s] }} />
                <span style={{ fontSize: 9, color: 'var(--steel)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {count} {s}
                </span>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Insight rows */}
      <div style={{ padding: '8px 0' }}>
        {insights.map((ins, idx) => {
          const isExpanded = expanded === ins.id;
          const color = SEV_COLOR[ins.severity];
          const bg = SEV_BG[ins.severity];

          return (
            <div
              key={ins.id}
              onClick={() => setExpanded(isExpanded ? null : ins.id)}
              style={{
                padding: '10px 18px',
                borderBottom: idx < insights.length - 1 ? '1px solid var(--line)' : 'none',
                cursor: 'pointer',
                background: isExpanded ? bg : 'transparent',
                transition: 'background .12s',
                display: 'grid',
                gridTemplateColumns: '3px 1fr',
                gap: 14,
              }}
            >
              {/* Severity indicator */}
              <div style={{
                borderRadius: 2,
                background: color,
                alignSelf: 'stretch',
                opacity: isExpanded ? 1 : 0.6,
                transition: 'opacity .12s',
              }} />

              <div>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: ins.detail ? 6 : 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--mist)', lineHeight: 1.4 }}>
                    {ins.title}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : ins.id); }}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--r)',
                      fontSize: 9,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      border: '1px solid var(--line-2)',
                      color: 'var(--steel)',
                      background: 'transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {isExpanded ? 'Collapse' : 'Detail'}
                  </button>
                </div>

                {/* Detail line — always visible */}
                {ins.detail && (
                  <div style={{ fontSize: 11, color: 'var(--graphite)', marginBottom: ins.attribution ? 6 : 0 }}>
                    {ins.detail}
                  </div>
                )}

                {/* Attribution bars — only when present */}
                {ins.attribution && <AttributionBar bars={ins.attribution} />}

                {/* Expanded: recommendation */}
                {isExpanded && (
                  <div style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    borderRadius: 'var(--r)',
                    background: 'rgba(255,255,255,.025)',
                    border: '1px solid var(--line-2)',
                  }}>
                    <div className="label" style={{ marginBottom: 4 }}>Recommendation</div>
                    <div style={{ fontSize: 11, color: 'var(--fog)', lineHeight: 1.5 }}>
                      {ins.rec}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
