'use client';

import { fmt, fmtUsd } from '@/lib/fmt';

const TYPES = [
  { id: 'code',        label: 'Code',          in: 12840, out: 6420, avgUseful: 94, costShare: .38 },
  { id: 'prose',       label: 'Prose',          in: 8210,  out: 4180, avgUseful: 88, costShare: .24 },
  { id: 'tool_output', label: 'Tool Output',    in: 6840,  out: 1240, avgUseful: 72, costShare: .18, flag: 'HIGH REPEAT' },
  { id: 'context',     label: 'Context / RAG',  in: 9420,  out: 840,  avgUseful: 65, costShare: .14, flag: 'BLOAT' },
  { id: 'media',       label: 'Media / Vision', in: 1840,  out: 680,  avgUseful: 91, costShare: .06 },
] as const;

function UsefulBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'var(--good)' : pct >= 80 ? 'var(--accent)' : 'var(--warn)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 72, height: 4, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{pct}%</span>
    </div>
  );
}

export function ContentTypeCard() {
  return (
    <div className="card">
      {/* Header */}
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
            <th>Avg Useful</th>
            <th>Cost Share</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {TYPES.map((t) => {
            const isHighCost = t.costShare >= 0.3;
            return (
              <tr key={t.id}>
                <td style={{ color: 'var(--mist)', fontWeight: 500 }}>{t.label}</td>
                <td className="mono" style={{ color: isHighCost ? 'var(--accent-2)' : 'var(--fog)' }}>
                  {fmt(t.in)}
                </td>
                <td className="mono" style={{ color: 'var(--fog)' }}>{fmt(t.out)}</td>
                <td><UsefulBar pct={t.avgUseful} /></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 48, height: 3, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${t.costShare * 100}%`, height: '100%', background: 'var(--accent)', opacity: 0.7, borderRadius: 2 }} />
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>{Math.round(t.costShare * 100)}%</span>
                  </div>
                </td>
                <td>
                  {'flag' in t && t.flag ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 7px',
                      borderRadius: 'var(--r)',
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: 'var(--warn)',
                      background: 'rgba(201,150,107,.1)',
                      border: '1px solid rgba(201,150,107,.25)',
                    }}>
                      {t.flag}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--graphite)', fontSize: 11 }}>-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer summary */}
      <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 24 }}>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Total in: <span className="mono" style={{ color: 'var(--fog)' }}>{fmt(TYPES.reduce((a, t) => a + t.in, 0))}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Total out: <span className="mono" style={{ color: 'var(--fog)' }}>{fmt(TYPES.reduce((a, t) => a + t.out, 0))}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--warn)', marginLeft: 'auto' }}>
          2 types flagged for optimization
        </div>
      </div>
    </div>
  );
}
