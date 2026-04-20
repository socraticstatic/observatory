'use client';

import { useState, useEffect, Fragment } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';

const FALLBACK_BASE = {
  dailyCostUsd:       21.72,
  opusSharePct:       42,
  cacheDepthPct:      44,
  reasoningBudgetPct: 38,
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

  const baseQuality  = 94.2;
  const qualityShift = ((opusShare - base.opusSharePct) / 100) * 6
                     - ((cacheDepth - base.cacheDepthPct) / 100) * 2;
  const qEffective   = baseQuality + qualityShift;

  const effNow     = b / baseQuality;
  const effNew     = projDaily / Math.max(qEffective, 1);
  const effImprove = ((effNow - effNew) / effNow) * 100;

  return { deltaDaily, projDaily, qualityShift, qEffective, effImprove };
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
          background: 'linear-gradient(90deg, rgba(217,119,87,.4), #D97757)',
          borderRadius: 2,
        }} />
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'relative', width: '100%',
            appearance: 'none', background: 'transparent',
            height: 20, cursor: 'pointer',
            accentColor: '#D97757',
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
  const { data: baselineData } = trpc.costDrivers.baseline.useQuery();

  const activeBase: Base = baselineData ?? FALLBACK_BASE;

  const [opusShare,       setOpusShare]       = useState(FALLBACK_BASE.opusSharePct);
  const [cacheDepth,      setCacheDepth]      = useState(FALLBACK_BASE.cacheDepthPct);
  const [reasoningBudget, setReasoningBudget] = useState(FALLBACK_BASE.reasoningBudgetPct);
  const [seeded,          setSeeded]          = useState(false);

  useEffect(() => {
    if (baselineData && !seeded) {
      setOpusShare(baselineData.opusSharePct);
      setCacheDepth(baselineData.cacheDepthPct);
      setReasoningBudget(baselineData.reasoningBudgetPct);
      setSeeded(true);
    }
  }, [baselineData, seeded]);

  const { deltaDaily, projDaily, qualityShift, qEffective, effImprove } =
    derive(activeBase, opusShare, cacheDepth, reasoningBudget);

  const baseDaily   = activeBase.dailyCostUsd;
  const projMonthly = projDaily * 30;
  const projAnnual  = projDaily * 365;

  const verdict = deltaDaily < 0 && qualityShift > -1
    ? { col: '#7A9E8A', bg: 'rgba(122,158,138,.08)', border: 'rgba(122,158,138,.2)',  icon: '✓', text: 'Net improvement — cost down, quality stable.' }
    : deltaDaily < 0 && qualityShift <= -1
    ? { col: '#C9966B', bg: 'rgba(201,150,107,.08)', border: 'rgba(201,150,107,.2)',  icon: '~', text: 'Cost savings at meaningful quality cost. Review before applying.' }
    : { col: '#B87070', bg: 'rgba(184,112,112,.08)', border: 'rgba(184,112,112,.2)',  icon: '✗', text: 'This configuration increases cost. Adjust sliders.' };

  const qualityBarW = Math.min(100, Math.max(0, qEffective - 60)) / 40 * 100;

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
                border: '1px solid rgba(217,119,87,.25)',
                borderRadius: 'var(--r)',
                color: '#D97757',
                background: 'rgba(217,119,87,.06)',
                cursor: 'pointer',
              }}
            >
              Reset to actual
            </button>
          )}
        </div>

        {/* Projections */}
        <div>
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
                    color: deltaDaily < 0 ? '#7A9E8A' : '#B87070',
                  }}>
                    {fmtUsd(row.proj)}
                  </span>
                </Fragment>
              ))}
            </div>
          </div>

          {/* Quality bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--graphite)', fontWeight: 500 }}>
                Quality index
              </span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: qualityShift >= 0 ? '#7A9E8A' : '#C9966B' }}>
                {qEffective.toFixed(1)}{' '}
                <span style={{ fontSize: 9, fontWeight: 400 }}>
                  {qualityShift >= 0 ? `+${qualityShift.toFixed(1)}` : qualityShift.toFixed(1)}
                </span>
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${qualityBarW}%`,
                background: qualityShift >= 0 ? '#7A9E8A' : '#C9966B',
                borderRadius: 2, transition: 'width 0.2s ease',
              }} />
            </div>
          </div>

          {/* Efficiency */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--graphite)', marginBottom: 8, fontWeight: 500 }}>
              Efficiency ($/quality-pt)
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              {[
                { label: 'baseline',  val: (baseDaily / 94.2).toFixed(3),                       col: 'rgba(200,185,165,.5)' },
                { label: 'projected', val: (projDaily / Math.max(qEffective, 1)).toFixed(3),     col: effImprove > 0 ? '#7A9E8A' : '#B87070' },
                { label: 'delta',     val: `${effImprove > 0 ? '+' : ''}${effImprove.toFixed(1)}%`, col: effImprove > 0 ? '#7A9E8A' : '#B87070' },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 9, color: 'rgba(200,185,165,.35)', marginBottom: 3, letterSpacing: '.06em' }}>
                    {m.label}
                  </div>
                  <div className="mono" style={{ fontSize: 13, color: m.col, fontWeight: 600 }}>
                    {m.val}
                  </div>
                </div>
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
        </div>
      </div>
    </div>
  );
}
