'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const LABEL_MAP: Record<string, string> = {
  code:        'Code',
  prose:       'Prose',
  tool_output: 'Tool output',
  context:     'Context/memory',
  media:       'Media refs',
  unknown:     'Structured',
};

const COLOR_MAP: Record<string, string> = {
  code:        '#6FA8B3',
  prose:       '#9BC4CC',
  tool_output: '#C9B08A',
  context:     '#8A9297',
  media:       '#B89FC9',
  unknown:     '#C8CED1',
};

const DOMINANT_MAP: Record<string, string> = {
  code:        'typescript, python',
  prose:       'essays, email, docs',
  tool_output: 'web_search, file reads',
  context:     'system, RAG, history',
  media:       'images, diagrams',
  unknown:     '',
};

interface Props { lookback: Lookback; provider?: string }

export function ContentTypeCard({ lookback, provider }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const { data = [], isLoading } = trpc.content.contentTypes.useQuery({ lookback, provider });

  const rows = useMemo(() => {
    const totalCost   = data.reduce((s, r) => s + r.costUsd, 0) || 1;
    const totalInput  = data.reduce((s, r) => s + r.inputTokens, 0) || 1;
    const totalOutput = data.reduce((s, r) => s + r.outputTokens, 0) || 1;

    return data.map(r => {
      const avgUseful = (r.avgQuality ?? 0) / 100;
      const costShare = r.costUsd / totalCost;
      let flag: string | null = null;
      if (r.id === 'tool_output' && avgUseful < 0.5) flag = 'low-yield';
      else if (r.id === 'context' && avgUseful < 0.4) flag = 'bloat';

      return {
        id:        r.id,
        label:     LABEL_MAP[r.id] ?? r.id,
        color:     COLOR_MAP[r.id] ?? '#6FA8B3',
        dominant:  DOMINANT_MAP[r.id] ?? '',
        in:        r.inputTokens / totalInput * 100,
        out:       r.outputTokens / totalOutput * 100,
        avgUseful,
        costShare,
        costUsd:   r.costUsd,
        flag,
      };
    });
  }, [data]);

  const maxIn  = Math.max(...rows.map(r => r.in),  1);
  const maxOut = Math.max(...rows.map(r => r.out), 1);

  // warning banner: sum input% of rows with avgUseful < 0.45
  const lowUtilityPct  = rows.filter(r => r.avgUseful < 0.45).reduce((s, r) => s + r.in, 0);
  const flaggedCostUsd = rows.filter(r => r.flag).reduce((s, r) => s + r.costUsd, 0);

  if (isLoading) {
    return (
      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="label" style={{ marginBottom: 8 }}>WHAT · CONTENT TYPES</div>
        <div style={{ fontSize: 12, color: 'var(--steel)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div className="label">WHAT · CONTENT TYPES</div>
          <div style={{ fontSize: 13, color: 'var(--fog)', marginTop: 3 }}>
            what <em style={{ color: 'var(--mist)', fontStyle: 'normal' }}>kind</em> of tokens you're buying
          </div>
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>classifier · heuristic+llm-judge</div>
      </div>

      {/* stacked cost-share bar */}
      <div style={{ height: 22, display: 'flex', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--line-2)', marginBottom: 8 }}>
        {rows.map(ct => (
          <div
            key={ct.id}
            onMouseEnter={() => setHover(ct.id)}
            onMouseLeave={() => setHover(null)}
            style={{
              width: (ct.costShare * 100) + '%',
              background: ct.color,
              opacity: hover && hover !== ct.id ? 0.35 : 1,
              transition: 'opacity 120ms',
              position: 'relative',
              cursor: 'pointer',
            }}
          >
            {ct.costShare > 0.08 && (
              <span style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: '#11171B', fontWeight: 600, letterSpacing: '.06em',
              }}>
                {Math.round(ct.costShare * 100)}%
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--graphite)', letterSpacing: '.12em', marginBottom: 12 }}>
        <span>COST SHARE</span>
        <span className="mono">&#931; {Math.round(rows.reduce((s, r) => s + r.costShare, 0) * 100)}%</span>
      </div>

      {/* type rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '130px 1fr 1fr 64px 90px',
          gap: 10,
          fontSize: 9,
          letterSpacing: '.14em',
          color: 'var(--graphite)',
          padding: '0 0 6px',
        }}>
          <span>TYPE</span>
          <span>INPUT %</span>
          <span>OUTPUT %</span>
          <span style={{ textAlign: 'right' }}>USEFUL</span>
          <span style={{ textAlign: 'right' }}>COST</span>
        </div>

        {rows.map(ct => (
          <div
            key={ct.id}
            onMouseEnter={() => setHover(ct.id)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: '130px 1fr 1fr 64px 90px',
              gap: 10,
              alignItems: 'center',
              padding: '6px 0',
              borderTop: '1px solid var(--line)',
              background: hover === ct.id ? 'rgba(111,168,179,.04)' : 'transparent',
              transition: 'background 120ms',
            }}
          >
            {/* label + swatch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: ct.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: 'var(--mist)' }}>{ct.label}</div>
                <div className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>{ct.dominant}</div>
              </div>
            </div>

            {/* input bar */}
            <div style={{ position: 'relative', height: 12, background: 'rgba(255,255,255,.02)', borderRadius: 2 }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: (ct.in / maxIn * 100) + '%',
                background: ct.color,
                opacity: 0.55,
              }} />
              <span className="mono" style={{ position: 'absolute', right: 4, top: 0, fontSize: 9, color: 'var(--fog)', lineHeight: '12px' }}>
                {ct.in.toFixed(1)}%
              </span>
            </div>

            {/* output bar */}
            <div style={{ position: 'relative', height: 12, background: 'rgba(255,255,255,.02)', borderRadius: 2 }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: (ct.out / maxOut * 100) + '%',
                background: ct.color,
              }} />
              <span className="mono" style={{ position: 'absolute', right: 4, top: 0, fontSize: 9, color: 'var(--fog)', lineHeight: '12px' }}>
                {ct.out.toFixed(1)}%
              </span>
            </div>

            {/* useful % */}
            <div className="mono" style={{
              fontSize: 11,
              textAlign: 'right',
              color: ct.avgUseful > 0.7 ? 'var(--good)' : ct.avgUseful > 0.5 ? 'var(--warn)' : 'var(--bad)',
            }}>
              {Math.round(ct.avgUseful * 100)}%
            </div>

            {/* cost + flag */}
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--mist)' }}>
                ${ct.costUsd.toFixed(2)}
              </div>
              {ct.flag && (
                <div className="mono" style={{
                  fontSize: 8,
                  color: ct.flag === 'bloat' ? '#D89A9A' : '#C9966B',
                  letterSpacing: '.12em',
                  marginTop: 1,
                }}>
                  {ct.flag.toUpperCase()} &#9888;
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* warning banner */}
      {lowUtilityPct > 0 && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          background: 'rgba(201,150,107,.06)',
          border: '1px solid rgba(201,150,107,.3)',
          borderRadius: 'var(--r)',
          fontSize: 11,
          color: 'var(--fog)',
          lineHeight: 1.5,
        }}>
          <span style={{ color: '#C9966B', fontWeight: 600 }}>
            &#9888; {Math.round(lowUtilityPct)}% of input is{' '}
            <span className="mono">tool output + context</span> with &lt;45% utility
          </span>
          {' '}&mdash; consider tighter retrieval + trimming old turns.{' '}
          {flaggedCostUsd > 0 && (
            <>
              Estimated recoverable:{' '}
              <span className="mono" style={{ color: 'var(--mist)' }}>
                ${flaggedCostUsd.toFixed(2)}/day
              </span>.
            </>
          )}
        </div>
      )}
    </div>
  );
}
