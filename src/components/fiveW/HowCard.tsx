'use client';

import { useState } from 'react';
import { fmtMs, fmt } from '@/lib/fmt';

const STEPS = [
  { id: 1, name: 'user_turn',      model: 'claude-opus-4.5',  ms: 0,    dur: 612,  tokens: 2184, col: '#9BC4CC', type: 'input'  },
  { id: 2, name: 'tool_call',      model: 'browser.search',   ms: 640,  dur: 284,  tokens: 0,    col: '#C9966B', type: 'tool'   },
  { id: 3, name: 'tool_result',    model: 'browser.search',   ms: 940,  dur: 148,  tokens: 840,  col: '#C9966B', type: 'tool'   },
  { id: 4, name: 'assistant_turn', model: 'claude-opus-4.5',  ms: 1100, dur: 920,  tokens: 412,  col: '#9BC4CC', type: 'output' },
  { id: 5, name: 'cache_lookup',   model: 'anthropic/cache',  ms: 2040, dur: 42,   tokens: 1840, col: '#4F7B83', type: 'cache'  },
  { id: 6, name: 'final_response', model: 'claude-opus-4.5',  ms: 2100, dur: 284,  tokens: 318,  col: '#6FA8B3', type: 'output' },
] as const;

const TOTAL_MS = 2400;

const TYPE_LABELS: Record<string, string> = {
  input:  'INPUT',
  output: 'OUTPUT',
  tool:   'TOOL',
  cache:  'CACHE',
};

type FilterType = 'all' | 'input' | 'output' | 'tool' | 'cache';

interface Props {
  drill?: { type: string; source: string; stepHint?: number; at?: number } | null;
}

export function HowCard({ drill }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  const visibleSteps = filter === 'all' ? STEPS : STEPS.filter(s => s.type === filter);

  const filters: FilterType[] = ['all', 'input', 'output', 'tool', 'cache'];

  return (
    <div className="card">
      {/* Header */}
      <div style={{
        padding: '14px 18px 12px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>HOW</span>
          <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>Agent Trace Waterfall</span>
        </div>
        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 4 }}>
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '3px 9px',
                borderRadius: 'var(--r)',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                border: '1px solid',
                cursor: 'pointer',
                transition: 'all .12s',
                borderColor: filter === f ? 'rgba(111,168,179,.5)' : 'var(--line-2)',
                color: filter === f ? 'var(--accent-2)' : 'var(--steel)',
                background: filter === f ? 'rgba(111,168,179,.08)' : 'transparent',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline axis */}
      <div style={{ padding: '12px 18px 4px' }}>
        <div style={{ position: 'relative', height: 14, marginLeft: 200, marginRight: 120 }}>
          {[0, 600, 1200, 1800, 2400].map(t => {
            const pct = (t / TOTAL_MS) * 100;
            return (
              <div
                key={t}
                style={{
                  position: 'absolute',
                  left: `${pct}%`,
                  transform: 'translateX(-50%)',
                  fontSize: 8,
                  color: 'var(--graphite)',
                  fontFamily: "'JetBrains Mono', monospace",
                  whiteSpace: 'nowrap',
                }}
              >
                {fmtMs(t)}
              </div>
            );
          })}
          {/* Tick marks */}
          {[0, 600, 1200, 1800, 2400].map(t => {
            const pct = (t / TOTAL_MS) * 100;
            return (
              <div
                key={`tick-${t}`}
                style={{
                  position: 'absolute',
                  left: `${pct}%`,
                  top: 8,
                  width: 1,
                  height: 4,
                  background: 'var(--line-2)',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Waterfall rows */}
      <div style={{ padding: '4px 18px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visibleSteps.map((step) => {
          const leftPct = (step.ms / TOTAL_MS) * 100;
          const widthPct = (step.dur / TOTAL_MS) * 100;
          const isDrillHighlight = drill?.stepHint === step.id;
          const isSelected = selectedStep === step.id;

          return (
            <div
              key={step.id}
              onClick={() => setSelectedStep(isSelected ? null : step.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '200px 1fr 120px',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                padding: '3px 6px',
                borderRadius: 'var(--r)',
                background: isSelected
                  ? 'rgba(111,168,179,.06)'
                  : isDrillHighlight
                  ? 'rgba(201,150,107,.06)'
                  : 'transparent',
                border: '1px solid',
                borderColor: isSelected
                  ? 'rgba(111,168,179,.2)'
                  : isDrillHighlight
                  ? 'rgba(201,150,107,.3)'
                  : 'transparent',
                transition: 'all .12s',
              }}
            >
              {/* Label */}
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--mist)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {step.name}
                </div>
                <div style={{ fontSize: 9, color: 'var(--graphite)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {step.model}
                </div>
              </div>

              {/* Bar track */}
              <div style={{ position: 'relative', height: 28, background: 'rgba(255,255,255,.025)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    width: `${Math.max(widthPct, 0.5)}%`,
                    top: 0,
                    bottom: 0,
                    background: step.col,
                    opacity: isSelected ? 0.85 : isDrillHighlight ? 0.9 : 0.6,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 4,
                    transition: 'opacity .12s',
                  }}
                >
                  {widthPct > 8 && (
                    <span style={{
                      fontSize: 8,
                      fontWeight: 600,
                      letterSpacing: '.1em',
                      color: 'rgba(0,0,0,.7)',
                      whiteSpace: 'nowrap',
                    }}>
                      {TYPE_LABELS[step.type]}
                    </span>
                  )}
                </div>
              </div>

              {/* Right stats */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                {step.tokens > 0 && (
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>{fmt(step.tokens)} tok</span>
                )}
                <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{fmtMs(step.dur)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div style={{
        padding: '9px 18px',
        borderTop: '1px solid var(--line)',
        display: 'flex',
        gap: 20,
        flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Total: <span className="mono" style={{ color: 'var(--fog)' }}>{fmtMs(TOTAL_MS)}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Tokens in: <span className="mono" style={{ color: 'var(--fog)' }}>{fmt(STEPS.reduce((a, s) => a + (s.type === 'input' || s.type === 'cache' ? s.tokens : 0), 0))}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Tokens out: <span className="mono" style={{ color: 'var(--fog)' }}>{fmt(STEPS.reduce((a, s) => a + (s.type === 'output' ? s.tokens : 0), 0))}</span>
        </div>
        {drill && (
          <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--warn)' }}>
            Drill: {drill.source}
          </div>
        )}
      </div>
    </div>
  );
}
