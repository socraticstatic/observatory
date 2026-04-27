'use client';

import { useState, useEffect, Fragment } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

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
  setValue: (v: number) => void;
  min?: number;
  max?: number;
  color?: string;
  unit?: string;
  hint?: string;
}

export function CounterfactualSimulator({ lookback, provider }: { lookback?: Lookback; provider?: string }) {
  const { data: baselineData, isLoading } = trpc.costDrivers.baseline.useQuery({ lookback, provider });

  const activeBase: Base = baselineData ?? EMPTY_BASE;

  const [opusShare,       setOpusShare]       = useState(EMPTY_BASE.opusSharePct);
  const [cacheDepth,      setCacheDepth]      = useState(EMPTY_BASE.cacheDepthPct);
  const [reasoningBudget, setReasoningBudget] = useState(EMPTY_BASE.reasoningBudgetPct);
  const [seeded,          setSeeded]          = useState(false);

  // One-time seed from API data
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

  const Slider = ({ label, value, setValue, min = 0, max = 100, color, unit = '%', hint }: SliderProps) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: 'var(--fog)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 12, color: color || 'var(--mist)', fontWeight: 600 }}>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => setValue(+e.target.value)}
        style={{ width: '100%', accentColor: color || 'var(--accent)' }}
      />
      {hint && (
        <div className="mono" style={{ fontSize: 9, color: 'var(--graphite)', letterSpacing: '.1em' }}>{hint}</div>
      )}
    </div>
  );

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div className="label">WHY · COUNTERFACTUAL</div>
          <div style={{ fontSize: 13, color: 'var(--fog)', marginTop: 3 }}>
            what <em style={{ color: 'var(--mist)', fontStyle: 'normal' }}>would</em> change cost &middot; live projection
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="mbtn"
            onClick={() => {
              setOpusShare(activeBase.opusSharePct);
              setCacheDepth(activeBase.cacheDepthPct);
              setReasoningBudget(activeBase.reasoningBudgetPct);
              setSeeded(false);
            }}
          >
            Reset
          </button>
          <button className="mbtn primary">Apply as rule</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* LEFT: controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>MODEL ROUTING</div>
            <Slider label="Opus share"          value={opusShare}       setValue={setOpusShare}       color="#9BC4CC" hint="premium reasoning" />
          </div>
          <div style={{ height: 1, background: 'var(--line)' }} />
          <div>
            <div className="label" style={{ marginBottom: 8 }}>OPTIMIZATIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Slider label="Cache depth"        value={cacheDepth}      setValue={setCacheDepth}      color="#7CA893" hint="stable system prompts + prefix-cache" />
              <Slider label="Reasoning budget"   value={reasoningBudget} setValue={setReasoningBudget} color="#C9B08A" hint="extended thinking budget %" />
            </div>
          </div>
        </div>

        {/* RIGHT: projections */}
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
