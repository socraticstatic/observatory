'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';

interface Attribution {
  label: string;
  pct: number;
  col: string;
}

interface Insight {
  id: number;
  severity: 'bad' | 'warn' | 'info';
  title: string;
  attribution: Attribution[];
  rec: string;
  drillTarget: string;
}

const FALLBACK_INSIGHTS: Insight[] = [
  {
    id: 1,
    severity: 'bad',
    title: 'Loop detected: research_agent.weekly_digest',
    attribution: [
      { label: 'Opus',  pct: .72, col: '#9BC4CC' },
      { label: 'Tool',  pct: .28, col: '#C9966B' },
    ],
    rec: 'Add step-count guard: exit after 8 iterations',
    drillTarget: 'HowCard',
  },
  {
    id: 2,
    severity: 'warn',
    title: 'Cache decay: hit ratio fell 38%→22% today',
    attribution: [
      { label: 'Input',  pct: .85, col: '#6FA8B3' },
      { label: 'Cached', pct: .15, col: '#4F7B83' },
    ],
    rec: 'Reanchor system prompt position before tools',
    drillTarget: 'WhatCard',
  },
  {
    id: 3,
    severity: 'warn',
    title: 'Routing opportunity: Opus for low-complexity tasks',
    attribution: [
      { label: 'Opus',   pct: .42, col: '#9BC4CC' },
      { label: 'Sonnet', pct: .58, col: '#6FA8B3' },
    ],
    rec: 'Route quality<88 tasks to Sonnet - saves ~$6.40/day',
    drillTarget: 'WhoCard',
  },
  {
    id: 4,
    severity: 'info',
    title: 'Retry waste: 14 failed tool calls retried today',
    attribution: [
      { label: 'Tool',  pct: .60, col: '#C9966B' },
      { label: 'Error', pct: .40, col: '#B86B6B' },
    ],
    rec: 'Add exponential backoff with jitter in automation surface',
    drillTarget: 'HowCard',
  },
];

const SEV_COLOR = {
  bad:  '#B86B6B',
  warn: '#C9966B',
  info: '#8A9297',
} as const;

const SEV_BG = {
  bad:  'rgba(184,107,107,.07)',
  warn: 'rgba(201,150,107,.07)',
  info: 'rgba(138,146,151,.04)',
} as const;

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

export function WhyInsightsCard() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data: insightData } = trpc.insights.whyInsights.useQuery();

  const INSIGHTS = useMemo<Insight[]>(() => {
    if (!insightData || insightData.length === 0) return FALLBACK_INSIGHTS;
    return insightData.map((r, idx) => ({
      id: idx + 1,
      severity: normalizeSev(r.severity),
      title: r.title,
      attribution: [{ label: 'Cost', pct: 1, col: '#6FA8B3' }],
      rec: r.recommendation,
      drillTarget: 'HowCard',
    }));
  }, [insightData]);

  return (
    <div className="card">
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>WHY</span>
        <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>Insights & Anomalies</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {(['bad', 'warn', 'info'] as const).map(s => {
            const count = INSIGHTS.filter(i => i.severity === s).length;
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
        {INSIGHTS.map((ins, idx) => {
          const isExpanded = expanded === ins.id;
          const color = SEV_COLOR[ins.severity];
          const bg = SEV_BG[ins.severity];

          return (
            <div
              key={ins.id}
              onClick={() => setExpanded(isExpanded ? null : ins.id)}
              style={{
                padding: '10px 18px',
                borderBottom: idx < INSIGHTS.length - 1 ? '1px solid var(--line)' : 'none',
                cursor: 'pointer',
                background: isExpanded ? bg : 'transparent',
                transition: 'background .12s',
                display: 'grid',
                gridTemplateColumns: '3px 1fr',
                gap: 14,
              }}
            >
              {/* Severity border */}
              <div style={{
                borderRadius: 2,
                background: color,
                alignSelf: 'stretch',
                opacity: isExpanded ? 1 : 0.6,
                transition: 'opacity .12s',
              }} />

              <div>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--mist)', lineHeight: 1.4, marginBottom: 6 }}>
                      {ins.title}
                    </div>
                    <AttributionBar bars={ins.attribution} />
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
                    {isExpanded ? 'Collapse' : `Drill → ${ins.drillTarget}`}
                  </button>
                </div>

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
