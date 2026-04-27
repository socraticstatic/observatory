'use client';

import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const COLORS = ['#6FA8B3', '#9BC4CC', '#C9B08A', '#7CA893', '#C8CED1', '#B88A8A', '#8A9297', '#B89FC9'];

interface Props {
  lookback: Lookback;
  provider?: string;
}

export function ProjectCostRail({ lookback, provider }: Props) {
  const { data: projects = [] } = trpc.entity.projects.useQuery({ lookback, provider });

  if (projects.length === 0) return null;

  const totalCost = projects.reduce((s, p) => s + p.costUsd, 0);
  const top6      = projects.slice(0, 6);
  const restCost  = projects.slice(6).reduce((s, p) => s + p.costUsd, 0);

  return (
    <div className="card" style={{ marginBottom: 12, padding: '12px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span className="label" style={{ fontSize: 9, letterSpacing: '.18em' }}>PROJECTS</span>
        <span style={{ fontSize: 10, color: 'var(--graphite)' }}>cost allocation · {lookback}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
          ${totalCost.toFixed(2)} total
        </span>
      </div>

      {/* Proportional bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1, marginBottom: 10 }}>
        {top6.map((p, i) => (
          <div
            key={p.project}
            title={`${p.project}: $${p.costUsd.toFixed(3)}`}
            style={{
              flex: p.costUsd,
              background: COLORS[i % COLORS.length],
              opacity: 0.8,
            }}
          />
        ))}
        {restCost > 0 && (
          <div
            title={`${projects.length - 6} others: $${restCost.toFixed(3)}`}
            style={{ flex: restCost, background: 'var(--graphite)', opacity: 0.4 }}
          />
        )}
      </div>

      {/* Project rows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px' }}>
        {top6.map((p, i) => {
          const pct = totalCost > 0 ? (p.costUsd / totalCost * 100) : 0;
          return (
            <div key={p.project} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 11, color: 'var(--fog)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                {p.project}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--steel)', flexShrink: 0 }}>
                {pct.toFixed(0)}%
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--graphite)', flexShrink: 0 }}>
                ${p.costUsd < 0.01 ? p.costUsd.toFixed(4) : p.costUsd.toFixed(2)}
              </span>
            </div>
          );
        })}
        {projects.length > 6 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--graphite)', flexShrink: 0, opacity: 0.5, display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: 'var(--graphite)' }}>
              +{projects.length - 6} more
            </span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--graphite)', marginLeft: 'auto' }}>
              ${restCost.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
