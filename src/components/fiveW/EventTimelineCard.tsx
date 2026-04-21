'use client';

import { useState } from 'react';

const EVENTS = [
  {d:2,  type:'edit',   title:'Edit: research_agent system prompt',        detail:'1.2k → 3.8k tokens',      impact:'+212% cost/run', severity:'bad'},
  {d:5,  type:'model',  title:'Claude Opus 4.5 released',                  detail:'auto-upgrade opt-in',     impact:'+$4.20/day',     severity:'warn'},
  {d:8,  type:'cache',  title:'Cache cleared (full)',                       detail:'manual reset',            impact:'cache-hit → 11%', severity:'bad'},
  {d:11, type:'budget', title:'Monthly budget reset',                       detail:'$200 allotment',          impact:'cycle start',    severity:'info'},
  {d:14, type:'rule',   title:'Rule: auto-route debug.* → Sonnet',         detail:'cost guard activated',    impact:'-$2.80/day',     severity:'good'},
  {d:17, type:'edit',   title:'Edit: pricing_engine RAG retrieval',        detail:'k=12 → k=5',              impact:'-38% input tok', severity:'good'},
  {d:21, type:'zombie', title:'Loop detected: debug.session',              detail:'22 steps on 3-step task', impact:'$6.40 wasted',   severity:'bad'},
  {d:25, type:'model',  title:'Gemini 2.5 Flash added',                    detail:'routing candidate',       impact:'opportunity',    severity:'info'},
  {d:28, type:'edit',   title:'Edit: inbox_triage compressed',             detail:'few-shot 8 → 3 examples', impact:'-24% cost',      severity:'good'},
] as const;

type EventItem = typeof EVENTS[number];

const EVENT_GLYPHS: Record<string, string> = {
  edit:   '✎',
  model:  '✦',
  cache:  '⌫',
  budget: '◎',
  rule:   '▸',
  zombie: '☠',
};

const SEV_COLOR: Record<string, string> = {
  good: '#7CA893',
  warn: '#C9966B',
  bad:  '#B86B6B',
  info: '#6FA8B3',
};

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

function buildSpend(): number[] {
  const rng = makeRng(42);
  return Array.from({ length: 30 }, (_, i) => {
    const base = 6 + Math.sin(i / 5) * 1.6 + Math.sin(i / 1.8) * 0.8;
    const spike = (i === 2 ? 1.6 : 0) + (i === 8 ? 2.4 : 0) + (i === 21 ? 3.8 : 0) + (i === 14 ? -1.2 : 0);
    return Math.max(2, base + spike + (rng() - 0.5) * 1.1);
  });
}

const SPEND = buildSpend();
const SPEND_MAX = Math.max(...SPEND);

function getSevKey(severity: string): string {
  if (severity === 'good') return 'good';
  if (severity === 'info') return 'info';
  if (severity === 'warn') return 'warn';
  return 'bad';
}

export function EventTimelineCard() {
  const [sel, setSel] = useState<EventItem>(EVENTS[5]);

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="label">WHEN · EVENT TIMELINE</div>
            <div style={{ fontSize: 13, color: 'var(--fog)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              what <em style={{ color: 'var(--mist)', fontStyle: 'normal' }}>changed</em> — annotated on spend
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {Object.entries(EVENT_GLYPHS).map(([k, g]) => {
              const sev = k === 'edit' ? 'warn' : k === 'cache' || k === 'zombie' ? 'bad' : k === 'rule' ? 'good' : 'info';
              return (
                <span
                  key={k}
                  title={k}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 5px',
                    border: '1px solid var(--line-2)',
                    borderRadius: 3,
                    background: 'rgba(255,255,255,.015)',
                    fontSize: 9,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: 'var(--fog)',
                  }}
                >
                  <span className="mono" style={{ color: SEV_COLOR[sev], fontSize: 10, lineHeight: 1 }}>{g}</span>
                  <span style={{ color: 'var(--steel)' }}>{k}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Spend curve with event pins */}
      <div style={{
        position: 'relative',
        height: 120,
        background: 'rgba(0,0,0,.25)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        padding: '8px 10px 22px',
      }}>
        <svg
          viewBox="0 0 600 90"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <linearGradient id="spendGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6FA8B3" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6FA8B3" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Spend area */}
          <path
            d={'M 0 90 ' + SPEND.map((v, i) => `L ${(i / 29) * 600} ${90 - (v / SPEND_MAX) * 80}`).join(' ') + ' L 600 90 Z'}
            fill="url(#spendGrad)"
          />
          {/* Spend line */}
          <path
            d={'M 0 ' + (90 - (SPEND[0] / SPEND_MAX) * 80) + ' ' + SPEND.map((v, i) => `L ${(i / 29) * 600} ${90 - (v / SPEND_MAX) * 80}`).join(' ')}
            fill="none"
            stroke="#6FA8B3"
            strokeWidth="1.2"
          />
        </svg>

        {/* Event pins */}
        {EVENTS.map(ev => {
          const x = (ev.d / 29) * 100;
          const y = 100 - (SPEND[ev.d] / SPEND_MAX) * 88;
          const sev = getSevKey(ev.severity);
          const color = SEV_COLOR[sev];
          const isSel = sel && sel.d === ev.d;
          return (
            <div
              key={ev.d}
              onClick={() => setSel(ev)}
              style={{
                position: 'absolute',
                left: `calc(${x}% + 10px)`,
                top: `calc(${y}% - 4px)`,
                transform: 'translate(-50%,-100%)',
                cursor: 'pointer',
                zIndex: isSel ? 3 : 2,
              }}
            >
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '12px',
                  bottom: -60,
                  width: 1,
                  background: color,
                  opacity: isSel ? 0.8 : 0.3,
                  transform: 'translateX(-50%)',
                }} />
                <div style={{
                  width: isSel ? 20 : 16,
                  height: isSel ? 20 : 16,
                  borderRadius: '50%',
                  background: '#11171B',
                  border: `1.5px solid ${color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: color,
                  fontSize: isSel ? 11 : 9,
                  fontFamily: 'JetBrains Mono',
                  fontWeight: 600,
                  boxShadow: isSel ? `0 0 0 3px ${color}33` : 'none',
                  transition: 'all 120ms',
                }}>
                  {EVENT_GLYPHS[ev.type]}
                </div>
              </div>
            </div>
          );
        })}

        {/* Day labels */}
        <div style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 4,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: 'var(--graphite)',
          fontFamily: 'JetBrains Mono',
        }}>
          <span>-30d</span>
          <span>-20d</span>
          <span>-10d</span>
          <span>today</span>
        </div>
      </div>

      {/* Selected event detail */}
      {sel && (() => {
        const sev = getSevKey(sel.severity);
        const color = SEV_COLOR[sev];
        return (
          <div style={{
            marginTop: 10,
            padding: '10px 12px',
            background: 'rgba(0,0,0,.2)',
            border: '1px solid var(--line)',
            borderLeft: `3px solid ${color}`,
            borderRadius: 'var(--r)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.1em' }}>
                D-{30 - sel.d}
              </span>
              <span className="mono" style={{ fontSize: 9, color: color, letterSpacing: '.14em', textTransform: 'uppercase' }}>
                {sel.type}
              </span>
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              <span className="mono" style={{
                fontSize: 11,
                color: sel.severity === 'good' ? 'var(--good)' : sel.severity === 'bad' ? 'var(--bad)' : 'var(--fog)',
              }}>
                {sel.impact}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 2 }}>{sel.title}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{sel.detail}</div>
          </div>
        );
      })()}

      {/* Footer */}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, fontSize: 10, color: 'var(--graphite)' }}>
        <span className="mono">
          {EVENTS.length} events · {EVENTS.filter(e => e.severity === 'bad').length} cost-negative · {EVENTS.filter(e => e.severity === 'good').length} cost-positive
        </span>
        <span style={{ flex: 1 }} />
        <button className="mbtn" style={{ padding: '3px 8px', fontSize: 9 }}>Add event</button>
      </div>
    </div>
  );
}
