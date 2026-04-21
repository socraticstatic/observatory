'use client';

import { useState } from 'react';

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

export function CounterfactualSimulator() {
  const [opusShare, setOpusShare] = useState<number>(42);
  const [sonnetShare, setSonnetShare] = useState<number>(30);
  const [haikuShare, setHaikuShare] = useState<number>(28);
  const [cacheBoost, setCacheBoost] = useState<number>(0);
  const [ctxTrim, setCtxTrim] = useState<number>(0);

  // normalize so they sum to 100
  const total = opusShare + sonnetShare + haikuShare;
  const o = opusShare / total;
  const s = sonnetShare / total;
  const h = haikuShare / total;

  // baseline spend: $42.18/day
  const rateOpus = 2.8;
  const rateSon = 0.84;
  const rateHaiku = 0.14;
  const baselineRate = 0.42 * rateOpus + 0.23 * rateSon + 0.05 * rateHaiku + 0.30 * 1.0;
  const newRate = o * rateOpus + s * rateSon + h * rateHaiku + 0.0 * 1.0;
  const ratio = newRate / baselineRate;

  const cacheFactor = 1 - (cacheBoost / 100) * 0.32;
  const ctxFactor = 1 - (ctxTrim / 100) * 0.4;

  const projDaily = 42.18 * ratio * cacheFactor * ctxFactor;
  const deltaDaily = projDaily - 42.18;
  const projMonthly = projDaily * 30;

  // quality model
  const qBlend = o * 98 + s * 94 + h * 82;
  const qualityNow = 0.42 * 98 + 0.23 * 94 + 0.05 * 82 + 0.30 * 89;
  const qualityShift = qBlend - ctxTrim * 0.12 + cacheBoost * 0.04 - qualityNow;
  const qEffective = qualityNow + qualityShift;

  // efficiency
  const effNow = 42.18 / qualityNow;
  const effNew = projDaily / qEffective;
  const effImprove = ((effNow - effNew) / effNow) * 100;

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
              setOpusShare(42);
              setSonnetShare(30);
              setHaikuShare(28);
              setCacheBoost(0);
              setCtxTrim(0);
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
            <div className="label" style={{ marginBottom: 8 }}>MODEL ROUTING (blended)</div>
            {/* blended share bar */}
            <div style={{ height: 18, display: 'flex', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--line-2)', marginBottom: 10 }}>
              <div style={{ width: (o * 100) + '%', background: '#9BC4CC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#11171B', fontWeight: 600 }}>
                {Math.round(o * 100)}%
              </div>
              <div style={{ width: (s * 100) + '%', background: '#6FA8B3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#11171B', fontWeight: 600 }}>
                {Math.round(s * 100)}%
              </div>
              <div style={{ width: (h * 100) + '%', background: '#4F7B83', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--mist)', fontWeight: 600 }}>
                {Math.round(h * 100)}%
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Slider label="Opus allocation"   value={opusShare}   setValue={setOpusShare}   color="#9BC4CC" hint="premium reasoning · $14.22 baseline" />
              <Slider label="Sonnet allocation" value={sonnetShare} setValue={setSonnetShare} color="#6FA8B3" hint="balanced · 6× cheaper than Opus" />
              <Slider label="Haiku allocation"  value={haikuShare}  setValue={setHaikuShare}  color="#4F7B83" hint="fast · 34× cheaper than Opus" />
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--line)' }} />

          <div>
            <div className="label" style={{ marginBottom: 8 }}>OPTIMIZATIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Slider label="Cache-hit improvement" value={cacheBoost} setValue={setCacheBoost} color="#7CA893" hint="stable system prompts + prefix-cache" />
              <Slider label="Context trim"          value={ctxTrim}    setValue={setCtxTrim}    color="#C9B08A" hint="RAG k-reduce + history summarization" />
            </div>
          </div>
        </div>

        {/* RIGHT: projections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* daily */}
          <div style={{ padding: '12px 14px', background: 'rgba(0,0,0,.25)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
            <div className="label">PROJECTED DAILY</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 28, color: 'var(--mist)', fontWeight: 600, letterSpacing: '-.02em' }}>
                ${projDaily.toFixed(2)}
              </span>
              <span className="mono" style={{ fontSize: 13, color: deltaDaily < 0 ? 'var(--good)' : deltaDaily > 0 ? 'var(--bad)' : 'var(--steel)', fontWeight: 600 }}>
                {deltaDaily < 0 ? '↓' : deltaDaily > 0 ? '↑' : '·'} ${Math.abs(deltaDaily).toFixed(2)}
              </span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 4, letterSpacing: '.08em' }}>
              vs $42.18 baseline · {((ratio * cacheFactor * ctxFactor - 1) * 100).toFixed(1)}% shift
            </div>
            {/* delta bar */}
            <div style={{ position: 'relative', height: 4, background: 'var(--ink)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--steel)', zIndex: 2 }} />
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                background: deltaDaily < 0 ? 'var(--good)' : 'var(--bad)',
                left: deltaDaily < 0 ? `calc(50% - ${Math.min(50, Math.abs(deltaDaily) / 20 * 50)}%)` : '50%',
                width: `${Math.min(50, Math.abs(deltaDaily) / 20 * 50)}%`,
              }} />
            </div>
          </div>

          {/* monthly + annual */}
          <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,.15)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div className="label">MONTHLY PROJECTION</div>
                <div className="mono" style={{ fontSize: 18, color: 'var(--mist)', marginTop: 2 }}>${projMonthly.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label">ANNUAL</div>
                <div className="mono" style={{ fontSize: 14, color: 'var(--fog)', marginTop: 2 }}>${(projDaily * 365).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* quality */}
          <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,.15)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
            <div className="label">QUALITY EXPECTED</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 18, color: qualityShift >= 0 ? 'var(--good)' : qualityShift > -2 ? 'var(--warn)' : 'var(--bad)' }}>
                {qEffective.toFixed(1)}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>
                {qualityShift >= 0 ? '+' : ''}{qualityShift.toFixed(2)} vs baseline
              </span>
            </div>
            {/* q bar */}
            <div style={{ position: 'relative', height: 6, background: 'var(--ink)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: ((qEffective / 100) * 100) + '%',
                background: qualityShift >= 0 ? 'linear-gradient(90deg,#4F7B83,#7CA893)' : 'linear-gradient(90deg,#C9966B,#B86B6B)',
              }} />
              <div style={{ position: 'absolute', left: (qualityNow / 100 * 100) + '%', top: -2, bottom: -2, width: 1, background: 'var(--mist)', opacity: .7 }} />
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--graphite)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>0</span><span>baseline {qualityNow.toFixed(1)}</span><span>100</span>
            </div>
          </div>

          {/* efficiency */}
          <div style={{
            padding: '10px 14px',
            background: effImprove > 5 ? 'rgba(124,168,147,.08)' : effImprove < -5 ? 'rgba(184,107,107,.08)' : 'rgba(0,0,0,.15)',
            border: '1px solid ' + (effImprove > 5 ? 'rgba(124,168,147,.3)' : effImprove < -5 ? 'rgba(184,107,107,.3)' : 'var(--line)'),
            borderRadius: 'var(--r)',
          }}>
            <div className="label" style={{ color: effImprove > 5 ? 'var(--good)' : effImprove < -5 ? 'var(--bad)' : 'var(--steel)' }}>
              EFFICIENCY · $/QUALITY-POINT
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 18, color: 'var(--mist)' }}>${effNew.toFixed(3)}</span>
              <span className="mono" style={{ fontSize: 11, color: effImprove > 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>
                {effImprove > 0 ? '↓' : '↑'} {Math.abs(effImprove).toFixed(1)}%
              </span>
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--graphite)', marginTop: 3 }}>
              was ${effNow.toFixed(3)} · {effImprove > 0 ? 'more' : 'less'} efficient than today
            </div>
          </div>
        </div>
      </div>

      {/* verdict */}
      <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(11,17,20,.6)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 16, color: deltaDaily < 0 && qualityShift > -1 ? 'var(--good)' : deltaDaily < 0 ? 'var(--warn)' : 'var(--bad)' }}>
          {deltaDaily < 0 && qualityShift > -1 ? '✓' : deltaDaily < 0 ? '~' : '✗'}
        </span>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--fog)', lineHeight: 1.5 }}>
          {deltaDaily < 0 && qualityShift > -1
            ? <>Save <span className="mono" style={{ color: 'var(--good)', fontWeight: 600 }}>${Math.abs(deltaDaily).toFixed(2)}/day</span> with only <span className="mono">{qualityShift.toFixed(2)}</span> quality delta. <span style={{ color: 'var(--accent-2)' }}>Recommended.</span></>
            : deltaDaily < 0
              ? <>Saves <span className="mono" style={{ color: 'var(--good)' }}>${Math.abs(deltaDaily).toFixed(2)}/day</span> but drops quality by <span className="mono" style={{ color: 'var(--bad)' }}>{qualityShift.toFixed(2)}</span>. <span style={{ color: 'var(--warn)' }}>Trade-off.</span></>
              : <>Costs <span className="mono" style={{ color: 'var(--bad)' }}>+${deltaDaily.toFixed(2)}/day</span> for <span className="mono">{qualityShift > 0 ? '+' : ''}{qualityShift.toFixed(2)}</span> quality. Worth it only if quality gains are critical.</>
          }
        </div>
      </div>
    </div>
  );
}
