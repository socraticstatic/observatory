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
  const b = Math.max(base.dailyCostUsd, 0.01);
  const opusDelta      = ((opusShare      - base.opusSharePct)       / 100) * b * 0.655;
  const cacheDelta     = -((cacheDepth    - base.cacheDepthPct)      / 100) * b * 0.388;
  const reasoningDelta = ((reasoningBudget - base.reasoningBudgetPct) / 100) * b * 0.313;
  const deltaDaily     = opusDelta + cacheDelta + reasoningDelta;
  const projDaily      = b + deltaDaily;

  const baseQuality    = 94.2;
  const qualityShift   = ((opusShare - base.opusSharePct) / 100) * 6
                       - ((cacheDepth - base.cacheDepthPct) / 100) * 2;
  const qEffective     = baseQuality + qualityShift;

  const effNow    = b / baseQuality;
  const effNew    = projDaily / Math.max(qEffective, 1);
  const effImprove = ((effNow - effNew) / effNow) * 100;

  return { deltaDaily, projDaily, qualityShift, qEffective, effImprove };
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  unit?: string;
}

function Slider({ label, value, min, max, onChange, unit = '%' }: SliderProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--fog)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--mist)' }}>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>{min}{unit}</span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>{max}{unit}</span>
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
    ? { icon: '✓', col: 'var(--good)',  text: 'Net improvement — cost down, quality stable.' }
    : deltaDaily < 0 && qualityShift <= -1
    ? { icon: '~', col: 'var(--warn)',  text: 'Cost savings at meaningful quality cost. Review before applying.' }
    : { icon: '✗', col: 'var(--bad)',   text: 'This configuration increases cost. Adjust sliders.' };

  const qualityBarW = Math.min(100, Math.max(0, qEffective - 60)) / 40 * 100;

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="label" style={{ marginBottom: 14 }}>
        Counterfactual Simulator · What if you changed your routing?
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Sliders */}
        <div>
          <Slider
            label="Model mix: Opus share"
            value={opusShare}
            min={0}
            max={100}
            onChange={setOpusShare}
          />
          <Slider
            label="Cache depth: context reuse"
            value={cacheDepth}
            min={0}
            max={100}
            onChange={setCacheDepth}
          />
          <Slider
            label="Reasoning budget: thinking tokens"
            value={reasoningBudget}
            min={0}
            max={100}
            onChange={setReasoningBudget}
          />
          {baselineData && (
            <button
              onClick={() => {
                setOpusShare(baselineData.opusSharePct);
                setCacheDepth(baselineData.cacheDepthPct);
                setReasoningBudget(baselineData.reasoningBudgetPct);
              }}
              style={{
                marginTop: 4,
                padding: '4px 10px',
                fontSize: 9,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r)',
                color: 'var(--steel)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              Reset to actual
            </button>
          )}
        </div>

        {/* Projections */}
        <div>
          {/* Cost grid */}
          <div style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>Projected spend</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '4px 16px', alignItems: 'baseline' }}>
              {[
                { period: 'Daily',   base: baseDaily,        proj: projDaily },
                { period: 'Monthly', base: baseDaily * 30,   proj: projMonthly },
                { period: 'Annual',  base: baseDaily * 365,  proj: projAnnual },
              ].map(row => (
                <Fragment key={row.period}>
                  <span style={{ fontSize: 10, color: 'var(--steel)' }}>{row.period}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--graphite)', textDecoration: 'line-through' }}>
                    {fmtUsd(row.base)}
                  </span>
                  <span className="mono" style={{
                    fontSize: 13,
                    color: deltaDaily < 0 ? 'var(--good)' : 'var(--bad)',
                    fontWeight: 600,
                  }}>
                    {fmtUsd(row.proj)}
                  </span>
                </Fragment>
              ))}
            </div>
          </div>

          {/* Quality bar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label">Quality index</span>
              <span className="mono" style={{ fontSize: 11, color: qualityShift >= 0 ? 'var(--good)' : 'var(--warn)' }}>
                {qEffective.toFixed(1)} {qualityShift >= 0 ? `+${qualityShift.toFixed(1)}` : qualityShift.toFixed(1)}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${qualityBarW}%`,
                background: qualityShift >= 0 ? 'var(--good)' : 'var(--warn)',
                borderRadius: 3,
                transition: 'width 0.2s',
              }} />
            </div>
          </div>

          {/* Efficiency metric */}
          <div style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 4 }}>Efficiency ($/quality-point)</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--graphite)', marginBottom: 2 }}>baseline</div>
                <div className="num" style={{ fontSize: 13, color: 'var(--fog)' }}>
                  {(baseDaily / 94.2).toFixed(3)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--graphite)', marginBottom: 2 }}>projected</div>
                <div className="num" style={{ fontSize: 13, color: effImprove > 0 ? 'var(--good)' : 'var(--bad)' }}>
                  {(projDaily / Math.max(qEffective, 1)).toFixed(3)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--graphite)', marginBottom: 2 }}>delta</div>
                <div className="num" style={{ fontSize: 13, color: effImprove > 0 ? 'var(--good)' : 'var(--bad)' }}>
                  {effImprove > 0 ? '+' : ''}{effImprove.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Verdict */}
          <div style={{
            padding: '8px 12px',
            background: `${verdict.col}15`,
            border: `1px solid ${verdict.col}40`,
            borderRadius: 'var(--r)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 14, color: verdict.col, lineHeight: 1.2, flexShrink: 0 }}>{verdict.icon}</span>
            <span style={{ fontSize: 11, color: verdict.col, lineHeight: 1.4 }}>{verdict.text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
