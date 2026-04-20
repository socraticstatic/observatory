'use client';

import { trpc } from '@/lib/trpc-client';
import { fmtUsd } from '@/lib/fmt';
import type { Lookback } from '@/lib/lookback';

interface Props {
  lookback: Lookback;
}

const DIMS: { key: 'provider' | 'model' | 'surface' | 'project' | 'contentType' | 'region'; title: string }[] = [
  { key: 'provider',    title: 'Provider' },
  { key: 'model',       title: 'Model' },
  { key: 'surface',     title: 'Surface' },
  { key: 'project',     title: 'Project' },
  { key: 'contentType', title: 'Content Type' },
  { key: 'region',      title: 'Region' },
];

interface DimItem {
  label: string;
  costUsd: number;
  pct: number;
  color: string;
}

function DimPanel({ title, items }: { title: string; items: DimItem[] }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div className="label" style={{ marginBottom: 12, letterSpacing: '.1em' }}>{title}</div>

      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--graphite)', textAlign: 'center', padding: '12px 0' }}>
          No data
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {items.map(item => (
            <div key={item.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--fog)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                  title={item.label}
                >
                  {item.label}
                </span>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--steel)' }}>
                    {item.pct.toFixed(1)}%
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--mist)', minWidth: 48, textAlign: 'right' }}>
                    {fmtUsd(item.costUsd)}
                  </span>
                </div>
              </div>
              <div style={{ height: 3, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${item.pct}%`,
                    background: item.color,
                    borderRadius: 2,
                    transition: 'width 0.35s ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CostDriversView({ lookback }: Props) {
  const { data, isFetching } = trpc.costDrivers.sixDimension.useQuery({ lookback });

  const totalCost = data
    ? (data.provider.reduce((s, r) => s + r.costUsd, 0))
    : 0;

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>Cost Drivers</span>
        <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>
          6-dimension attribution
        </span>
        {totalCost > 0 && (
          <span className="mono" style={{ fontSize: 12, color: 'var(--fog)', marginLeft: 8 }}>
            {fmtUsd(totalCost)} total
          </span>
        )}
        {isFetching && (
          <span style={{ fontSize: 10, color: 'var(--graphite)', marginLeft: 'auto' }}>loading…</span>
        )}
      </div>

      {/* 3×2 dimension grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {DIMS.map(({ key, title }) => (
          <DimPanel
            key={key}
            title={title}
            items={data?.[key] ?? []}
          />
        ))}
      </div>
    </div>
  );
}

