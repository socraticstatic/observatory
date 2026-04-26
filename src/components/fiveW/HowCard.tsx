'use client';

import { useState } from 'react';
import { fmtMs, fmt } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

// Color by content type
const TYPE_COL: Record<string, string> = {
  user_turn:      '#A89276',
  assistant_turn: '#6FA8B3',
  tool_call:      '#C9966B',
  tool_result:    '#C9966B',
  cache_read:     '#7CA893',
  cache_write:    '#7CA893',
  llm_call:       '#A89276',
  unknown:        '#7A7068',
};

const TYPE_LABELS: Record<string, string> = {
  user_turn:      'INPUT',
  assistant_turn: 'OUTPUT',
  tool_call:      'TOOL',
  tool_result:    'TOOL',
  cache_read:     'CACHE',
  cache_write:    'CACHE',
  llm_call:       'LLM',
  unknown:        '?',
};

function typeCategory(contentType: string): 'input' | 'output' | 'tool' | 'cache' {
  if (contentType === 'user_turn' || contentType === 'llm_call') return 'input';
  if (contentType === 'assistant_turn') return 'output';
  if (contentType.startsWith('tool')) return 'tool';
  if (contentType.startsWith('cache')) return 'cache';
  return 'input';
}

type FilterType = 'all' | 'input' | 'output' | 'tool' | 'cache';

interface Props {
  drill?: { type: string; source: string; stepHint?: number; at?: number; sessionId?: string } | null;
  lookback?: Lookback;
  provider?: string;
}

export function HowCard({ drill, lookback = '24H', provider }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  const targetSessionId = drill?.sessionId ?? null;

  const { data: latestData } = trpc.how.latestTrace.useQuery({ lookback, provider }, {
    enabled: !targetSessionId,
  });
  const { data: specificData } = trpc.how.agentTrace.useQuery(
    { sessionId: targetSessionId ?? '' },
    { enabled: !!targetSessionId },
  );

  const data = targetSessionId
    ? (specificData ? { sessionId: targetSessionId, events: specificData } : undefined)
    : latestData;

  const events = data?.events ?? [];
  const totalMs = events.length > 0
    ? events[events.length - 1].msOffset + events[events.length - 1].latencyMs
    : 2400;

  const visibleSteps = events.filter(e =>
    filter === 'all' || typeCategory(e.contentType) === filter
  );

  const filters: FilterType[] = ['all', 'input', 'output', 'tool', 'cache'];

  if (!data) {
    return (
      <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>No trace data</span>
      </div>
    );
  }

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
          {data.sessionId && (
            <span style={{ fontSize: 9, color: targetSessionId ? 'var(--warn)' : 'var(--graphite)', fontFamily: "'JetBrains Mono', monospace" }}>
              {targetSessionId ? `▶ ${data.sessionId.slice(0, 8)}…` : `${data.sessionId.slice(0, 8)}…`}
            </span>
          )}
        </div>
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
          {[0, .25, .5, .75, 1].map((t, ti) => {
            const ms = Math.round(t * totalMs);
            return (
              <div
                key={`label-${ti}`}
                style={{
                  position: 'absolute',
                  left: `${t * 100}%`,
                  transform: 'translateX(-50%)',
                  fontSize: 8,
                  color: 'var(--graphite)',
                  fontFamily: "'JetBrains Mono', monospace",
                  whiteSpace: 'nowrap',
                }}
              >
                {fmtMs(ms)}
              </div>
            );
          })}
          {[0, .25, .5, .75, 1].map(t => (
            <div
              key={`tick-${t}`}
              style={{
                position: 'absolute',
                left: `${t * 100}%`,
                top: 8,
                width: 1,
                height: 4,
                background: 'var(--line-2)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Waterfall rows */}
      <div style={{ padding: '4px 18px 14px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 440, overflowY: 'auto' }}>
        {visibleSteps.map((step) => {
          const leftPct = totalMs > 0 ? (step.msOffset / totalMs) * 100 : 0;
          const widthPct = totalMs > 0 ? (step.latencyMs / totalMs) * 100 : 1;
          const isDrillHighlight = drill?.stepHint === step.step;
          const isSelected = selectedStep === step.step;
          const col = TYPE_COL[step.contentType] ?? TYPE_COL.unknown;
          const label = TYPE_LABELS[step.contentType] ?? step.contentType.toUpperCase();
          const tokens = step.inputTokens + step.outputTokens;

          return (
            <div
              key={step.id}
              onClick={() => setSelectedStep(isSelected ? null : step.step)}
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
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--mist)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {label}
                </div>
                <div style={{ fontSize: 9, color: 'var(--graphite)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {step.model}
                </div>
              </div>

              <div style={{ position: 'relative', height: 28, background: 'rgba(255,255,255,.025)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    width: `${Math.max(widthPct, 0.5)}%`,
                    top: 0,
                    bottom: 0,
                    background: col,
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
                      {label}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                {tokens > 0 && (
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>{fmt(tokens)} tok</span>
                )}
                {step.latencyMs > 0
                  ? <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{fmtMs(step.latencyMs)}</span>
                  : step.inputTokens > 0
                  ? <span style={{ fontSize: 9, color: 'var(--accent-2)', letterSpacing: '.08em', fontFamily: "'JetBrains Mono', monospace" }}>cache</span>
                  : <span className="mono" style={{ fontSize: 10, color: 'var(--graphite)' }}>—</span>
                }
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
          Total: <span className="mono" style={{ color: 'var(--fog)' }}>{fmtMs(totalMs)}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Steps: <span className="mono" style={{ color: 'var(--fog)' }}>{events.length}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Tokens in: <span className="mono" style={{ color: 'var(--fog)' }}>{fmt(events.reduce((a, e) => a + e.inputTokens, 0))}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Tokens out: <span className="mono" style={{ color: 'var(--fog)' }}>{fmt(events.reduce((a, e) => a + e.outputTokens, 0))}</span>
        </div>
        {events.length >= 200 && (
          <div style={{ fontSize: 9, color: 'var(--graphite)', letterSpacing: '.06em' }}>
            CAPPED AT 200 STEPS
          </div>
        )}
        {drill && (
          <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--warn)' }}>
            Drill: {drill.source}
          </div>
        )}
      </div>
    </div>
  );
}
