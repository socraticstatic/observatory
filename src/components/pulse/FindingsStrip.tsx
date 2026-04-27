'use client';

import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

type Severity = 'act' | 'warn' | 'info';
type Category = 'cost' | 'latency' | 'efficiency' | 'reliability';

const SEV_COLOR: Record<Severity, string> = {
  act:  'var(--bad)',
  warn: '#C9966B',
  info: 'var(--steel)',
};

const CAT_COLOR: Record<Category, string> = {
  cost:        '#C9966B',
  latency:     '#9BC4CC',
  efficiency:  '#7CA893',
  reliability: '#B88A8A',
};

interface Props {
  lookback: Lookback;
  provider?: string;
  onNavigate?: (view: string) => void;
}

export function FindingsStrip({ lookback, provider, onNavigate }: Props) {
  const { data: findings = [], isLoading } = trpc.insights.findings.useQuery({ lookback, provider });

  if (isLoading) return null;

  const actCount  = findings.filter(f => f.severity === 'act').length;
  const warnCount = findings.filter(f => f.severity === 'warn').length;
  const top3      = findings.slice(0, 3);

  if (top3.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px',
        marginBottom: 8,
        background: 'rgba(124,168,147,.04)',
        border: '1px solid rgba(124,168,147,.15)',
        borderRadius: 'var(--r)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--good)', display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--graphite)', flex: 1 }}>All systems nominal — no findings for this window</span>
        <button
          className="mbtn"
          onClick={() => onNavigate?.('Intel')}
          style={{ fontSize: 9, padding: '2px 8px' }}
        >
          Intel ▸
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--steel)', fontWeight: 600 }}>
          FINDINGS
        </span>
        {actCount  > 0 && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', color: 'var(--bad)'  }}>{actCount} ACT</span>}
        {warnCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', color: '#C9966B'     }}>{warnCount} WARN</span>}
        {findings.length > 3 && (
          <span style={{ fontSize: 9, color: 'var(--graphite)' }}>+{findings.length - 3} more</span>
        )}
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <button
          className="mbtn"
          onClick={() => onNavigate?.('Intel')}
          style={{ fontSize: 9, padding: '2px 8px' }}
        >
          View all ▸
        </button>
      </div>

      {/* Finding cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${top3.length}, 1fr)`, gap: 8 }}>
        {top3.map(f => {
          const sevColor = SEV_COLOR[f.severity as Severity] ?? 'var(--steel)';
          const catColor = CAT_COLOR[f.category as Category] ?? 'var(--steel)';
          return (
            <div
              key={f.id}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r)',
                border: `1px solid ${sevColor}30`,
                background: f.severity === 'act' ? 'rgba(184,107,107,.04)' : 'var(--panel-2)',
                display: 'grid',
                gridTemplateColumns: '3px 1fr',
                gap: 10,
              }}
            >
              <div style={{ borderRadius: 2, background: sevColor, opacity: 0.8 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: '.12em',
                    textTransform: 'uppercase', padding: '1px 5px',
                    borderRadius: 'var(--r)',
                    background: `${sevColor}18`, color: sevColor,
                    border: `1px solid ${sevColor}35`,
                    flexShrink: 0,
                  }}>
                    {f.severity.toUpperCase()}
                  </span>
                  <span style={{
                    fontSize: 8, fontWeight: 600, letterSpacing: '.08em',
                    textTransform: 'uppercase', padding: '1px 5px',
                    borderRadius: 'var(--r)',
                    background: `${catColor}15`, color: catColor,
                    flexShrink: 0,
                  }}>
                    {f.category}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--mist)', marginBottom: 3, lineHeight: 1.3 }}>
                  {f.title}
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.impact}
                </div>
                <div style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  → {f.action}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
