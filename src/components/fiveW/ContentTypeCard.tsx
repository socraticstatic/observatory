'use client';

import { useMemo } from 'react';
import { fmt } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const LABEL_MAP: Record<string, string> = {
  code:        'Code',
  prose:       'Prose',
  tool_output: 'Tool Output',
  context:     'Context / RAG',
  media:       'Media / Vision',
  unknown:     'Unknown',
};

function flag(id: string, quality: number | null): string | null {
  if (quality == null) return null;
  if (id === 'tool_output' && quality < 80) return 'HIGH REPEAT';
  if ((id === 'context' || id === 'unknown') && quality < 75) return 'BLOAT';
  if (quality < 70) return 'OPTIMIZE';
  return null;
}

function UsefulBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'var(--good)' : pct >= 80 ? 'var(--accent)' : 'var(--warn)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 72, height: 4, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{Math.round(pct)}%</span>
    </div>
  );
}

interface Props { lookback: Lookback; provider?: string }

export function ContentTypeCard({ lookback, provider }: Props) {
  const { data = [] } = trpc.content.contentTypes.useQuery({ lookback, provider });

  const rows = useMemo(() => {
    const totalCost = data.reduce((s, r) => s + r.costUsd, 0) || 1;
    return data.map(r => ({
      ...r,
      label:     LABEL_MAP[r.id] ?? r.id,
      costShare: r.costUsd / totalCost,
      quality:   r.avgQuality ?? null,
      flagText:  flag(r.id, r.avgQuality ?? null),
    }));
  }, [data]);

  const totalIn  = rows.reduce((s, r) => s + r.inputTokens, 0);
  const totalOut = rows.reduce((s, r) => s + r.outputTokens, 0);
  const flagCount = rows.filter(r => r.flagText).length;

  return (
    <div className="card">
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>Content Types</span>
        <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>Token distribution by content class</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>In</th>
            <th>Out</th>
            <th>Avg Quality</th>
            <th>Cost Share</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--steel)', padding: '24px 0' }}>No data</td></tr>
          ) : rows.map((t) => (
            <tr key={t.id}>
              <td style={{ color: 'var(--mist)', fontWeight: 500 }}>{t.label}</td>
              <td className="mono" style={{ color: t.costShare >= 0.3 ? 'var(--accent-2)' : 'var(--fog)' }}>
                {fmt(t.inputTokens)}
              </td>
              <td className="mono" style={{ color: 'var(--fog)' }}>{fmt(t.outputTokens)}</td>
              <td>{t.quality != null ? <UsefulBar pct={t.quality} /> : <span style={{ color: 'var(--graphite)', fontSize: 11 }}>—</span>}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 48, height: 3, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${t.costShare * 100}%`, height: '100%', background: 'var(--accent)', opacity: 0.7, borderRadius: 2 }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{Math.round(t.costShare * 100)}%</span>
                </div>
              </td>
              <td>
                {t.flagText ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '2px 7px', borderRadius: 'var(--r)',
                    fontSize: 9, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase',
                    color: 'var(--warn)', background: 'rgba(201,150,107,.1)', border: '1px solid rgba(201,150,107,.25)',
                  }}>
                    {t.flagText}
                  </span>
                ) : (
                  <span style={{ color: 'var(--graphite)', fontSize: 11 }}>-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 24 }}>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Total in: <span className="mono" style={{ color: 'var(--fog)' }}>{fmt(totalIn)}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Total out: <span className="mono" style={{ color: 'var(--fog)' }}>{fmt(totalOut)}</span>
        </div>
        {flagCount > 0 && (
          <div style={{ fontSize: 10, color: 'var(--warn)', marginLeft: 'auto' }}>
            {flagCount} type{flagCount > 1 ? 's' : ''} flagged for optimization
          </div>
        )}
      </div>
    </div>
  );
}
