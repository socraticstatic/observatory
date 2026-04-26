'use client';

import { useState, useEffect, Fragment } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';

const EMPTY_BASE = {
  dailyCostUsd:       0,
  opusSharePct:       0,
  cacheDepthPct:      0,
  reasoningBudgetPct: 0,
};

interface Base {
  dailyCostUsd: number;
  opusSharePct: number;
  cacheDepthPct: number;
  reasoningBudgetPct: number;
}

function derive(base: Base, opusShare: number, cacheDepth: number, reasoningBudget: number) {
  const b           = Math.max(base.dailyCostUsd, 0.01);
  const opusDelta   = ((opusShare      - base.opusSharePct)       / 100) * b * 0.655;
  const cacheDelta  = -((cacheDepth    - base.cacheDepthPct)      / 100) * b * 0.388;
  const reasonDelta = ((reasoningBudget - base.reasoningBudgetPct) / 100) * b * 0.313;
  const deltaDaily  = opusDelta + cacheDelta + reasonDelta;
  const projDaily   = b + deltaDaily;

  return { deltaDaily, projDaily };
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 11, color: 'var(--steel)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 12, color: '#E8D5C0', fontWeight: 500 }}>{value}%</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0,
          transform: 'translateY(-50%)', height: 3,
          background: 'rgba(255,255,255,.06)', borderRadius: 2,
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: 0,
          transform: 'translateY(-50%)', height: 3,
          width: `${pct}%`,
          background: 'linear-gradient(90deg, rgba(111,168,179,.4), #6FA8B3)',
          borderRadius: 2,
        }} />
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'relative', width: '100%',
            appearance: 'none', background: 'transparent',
            height: 20, cursor: 'pointer',
            accentColor: '#6FA8B3',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span className="mono" style={{ fontSize: 9, color: 'rgba(200,185,165,.3)' }}>{min}%</span>
        <span className="mono" style={{ fontSize: 9, color: 'rgba(200,185,165,.3)' }}>{max}%</span>
      </div>
    </div>
  );
}

export function CounterfactualSimulator() {
  const { data: baselineData, isLoading } = trpc.costDrivers.baseline.useQuery();

  const activeBase: Base = baselineData ?? EMPTY_BASE;

  const [opusShare,       setOpusShare]       = useState(EMPTY_BASE.opusSharePct);
  const [cacheDepth,      setCacheDepth]      = useState(EMPTY_BASE.cacheDepthPct);
  const [reasoningBudget, setReasoningBudget] = useState(EMPTY_BASE.reasoningBudgetPct);
  const [seeded,          setSeeded]          = useState(false);

  // One-time seed from API data — intentional, not a cascade risk
  useEffect(() => {
    if (baselineData && !seeded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpusShare(baselineData.opusSharePct);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCacheDepth(baselineData.cacheDepthPct);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReasoningBudget(baselineData.reasoningBudgetPct);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeeded(true);
    }
  }, [baselineData, seeded]);

  const noBaseline = !isLoading && (!baselineData || baselineData.dailyCostUsd === 0);

  const { deltaDaily, projDaily } =
    derive(activeBase, opusShare, cacheDepth, reasoningBudget);

  const baseDaily   = activeBase.dailyCostUsd;
  const projMonthly = projDaily * 30;
  const projAnnual  = projDaily * 365;

  const verdict = Math.abs(deltaDaily) < 0.001
    ? { col: 'var(--steel)',  bg: 'rgba(140,140,140,.05)', border: 'rgba(140,140,140,.15)', icon: '—', text: 'At baseline. Move sliders to simulate a change.' }
    : deltaDaily < 0
    ? { col: '#7CA893', bg: 'rgba(122,158,138,.08)', border: 'rgba(122,158,138,.2)',  icon: '✓', text: 'Cost reduction projected at current traffic mix.' }
    : { col: '#B87070', bg: 'rgba(184,112,112,.08)', border: 'rgba(184,112,112,.2)',  icon: '✗', text: 'This configuration increases cost. Adjust sliders.' };

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fog)', letterSpacing: '-.01em', lineHeight: 1.2 }}>
          Counterfactual Simulator
        </div>
        <div style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 3, letterSpacing: '.08em' }}>
          what if you changed your routing?
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        {/* Sliders */}
        <div>
          <Slider label="Model mix · Opus share"        value={opusShare}       min={0} max={100} onChange={setOpusShare} />
          <Slider label="Cache depth · context reuse"   value={cacheDepth}      min={0} max={100} onChange={setCacheDepth} />
          <Slider label="Reasoning budget · think tokens" value={reasoningBudget} min={0} max={100} onChange={setReasoningBudget} />

          {baselineData && (
            <button
              onClick={() => {
                setOpusShare(baselineData.opusSharePct);
                setCacheDepth(baselineData.cacheDepthPct);
                setReasoningBudget(baselineData.reasoningBudgetPct);
              }}
              style={{
                marginTop: 4, padding: '4px 12px',
                fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600,
                border: '1px solid rgba(111,168,179,.25)',
                borderRadius: 'var(--r)',
                color: '#6FA8B3',
                background: 'rgba(111,168,179,.06)',
                cursor: 'pointer',
              }}
            >
              Reset to actual
            </button>
          )}
        </div>

        {/* Projections */}
        <div style={noBaseline ? { display: 'flex', flexDirection: 'column', justifyContent: 'center' } : undefined}>
          {noBaseline && (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 6 }}>No baseline data</div>
              <div style={{ fontSize: 11, color: 'var(--graphite)', lineHeight: 1.6 }}>
                No API calls in the last 24h.<br />Projections will appear once activity is recorded.
              </div>
            </div>
          )}

          {!noBaseline && (
            <>
              {/* Spend grid */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--graphite)', marginBottom: 10, fontWeight: 500 }}>
                  Projected spend
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '5px 14px', alignItems: 'baseline' }}>
                  {[
                    { period: 'Daily',   base: baseDaily,       proj: projDaily },
                    { period: 'Monthly', base: baseDaily * 30,  proj: projMonthly },
                    { period: 'Annual',  base: baseDaily * 365, proj: projAnnual },
                  ].map(row => (
                    <Fragment key={row.period}>
                      <span style={{ fontSize: 10, color: 'var(--graphite)' }}>{row.period}</span>
                      <span className="mono" style={{ fontSize: 10, color: 'rgba(200,185,165,.3)', textDecoration: 'line-through' }}>
                        {fmtUsd(row.base)}
                      </span>
                      <span className="mono" style={{
                        fontSize: 13, fontWeight: 600,
                        color: deltaDaily < 0 ? '#7CA893' : '#B87070',
                      }}>
                        {fmtUsd(row.proj)}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* Verdict */}
              <div style={{
                padding: '8px 12px',
                background: verdict.bg,
                border: `1px solid ${verdict.border}`,
                borderRadius: 'var(--r)',
                display: 'flex', gap: 9, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 13, color: verdict.col, lineHeight: 1.2, flexShrink: 0 }}>
                  {verdict.icon}
                </span>
                <span style={{ fontSize: 11, color: verdict.col, lineHeight: 1.5 }}>
                  {verdict.text}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
