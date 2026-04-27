'use client';

import { useMemo } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { LOOKBACKS, type Lookback } from '@/lib/lookback';
import { trpc } from '@/lib/trpc-client';

function modelColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus'))   return '#9BC4CC';
  if (m.includes('sonnet')) return '#6FA8B3';
  if (m.includes('haiku'))  return '#4F7B83';
  if (m.includes('gemini')) return '#C9B08A';
  if (m.includes('grok'))   return '#B88A8A';
  if (m.includes('llama'))  return '#8A9297';
  return '#4A5358';
}

interface Props { lookback: Lookback; provider?: string }

export function OverallCostHero({ lookback, provider }: Props) {
  const { data: costData }  = trpc.pulse.overallCost.useQuery({ lookback, provider });
  const { data: chartData } = trpc.pulse.pulseChart.useQuery({ lookback, provider });
  const { data: modelData } = trpc.who.modelAttribution.useQuery({ lookback, provider });

  const total              = costData?.totalCostUsd ?? 0;
  const inference          = costData?.inferenceCostUsd ?? total;
  const cacheRead          = costData?.cacheReadCostUsd ?? 0;
  const prior              = costData?.priorCostUsd ?? 0;
  const priorInference     = costData?.priorInferenceCostUsd ?? prior;
  const isSubscription     = costData?.isSubscriptionBilling ?? false;
  const deltaPct = priorInference > 0 ? (inference - priorInference) / priorInference * 100 : null;
  const dCol = deltaPct == null
    ? 'var(--steel)'
    : deltaPct > 15 ? '#B86B6B'
    : deltaPct > 0  ? '#C9966B'
    : '#7CA893';

  const costSeries = chartData?.map(r => r.cost) ?? [];
  const maxCost = Math.max(...costSeries, 0.001);

  const mix = useMemo(() => {
    if (!modelData || modelData.length === 0) return [];
    const totalShare = modelData.reduce((s, m) => s + m.share, 0) || 100;
    return modelData.map(m => ({
      k: m.model,
      v: m.share / totalShare,
      c: modelColor(m.model),
    }));
  }, [modelData]);

  const { label } = LOOKBACKS[lookback];

  return (
    <div className="card" style={{ marginTop: 16, padding: '18px 22px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.2fr)', gap: 24, alignItems: 'center' }}>

      {/* Col 1: cost number + delta */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="label" style={{ color: 'var(--graphite)' }}>
            {isSubscription ? 'SUBSCRIPTION COST' : 'INFERENCE COST'} · {label.toUpperCase()}
          </div>
          {isSubscription && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
              color: 'var(--accent-2)', background: 'rgba(111,168,179,.1)',
              border: '1px solid rgba(111,168,179,.2)', borderRadius: 3, padding: '1px 5px',
            }}>FLAT</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
          <span className="num" style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-.02em', color: 'var(--mist)' }}>
            {fmtUsd(inference)}
          </span>
          {deltaPct != null && (
            <span className="mono" style={{ fontSize: 12, color: dCol }}>
              {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(Math.round(deltaPct))}%
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginTop: 4, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>
            vs {fmtUsd(priorInference)} prior {label.replace('last ', '')}
          </span>
          {!isSubscription && cacheRead > 0 && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--graphite)' }}>
              +{fmtUsd(cacheRead)} cache reads
            </span>
          )}
        </div>

        {/* Projection badge */}
        {costData?.projectedMonthUsd != null && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 8, padding: '4px 10px',
            borderRadius: 4,
            background: costData.projectionTrend === 'over'
              ? 'rgba(184,107,107,.12)' : 'rgba(76,91,97,.15)',
            border: `1px solid ${costData.projectionTrend === 'over' ? 'rgba(184,107,107,.3)' : 'var(--line-2)'}`,
          }}>
            <span className="mono" style={{
              fontSize: 10, letterSpacing: '.08em',
              color: costData.projectionTrend === 'over' ? '#B86B6B' : 'var(--graphite)',
            }}>
              PROJECTED
            </span>
            <span className="mono" style={{
              fontSize: 12, fontWeight: 600,
              color: costData.projectionTrend === 'over' ? '#B86B6B' : 'var(--fog)',
            }}>
              {fmtUsd(costData.projectedMonthUsd)}
            </span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>
              this month · {costData.daysRemainingInMonth}d left
            </span>
            {costData.projectionTrend === 'over' && costData.monthlyBudget != null && (
              <span className="mono" style={{ fontSize: 10, color: '#B86B6B' }}>
                ▲ over {fmtUsd(costData.monthlyBudget)} budget
              </span>
            )}
          </div>
        )}
      </div>

      {/* Col 2: spend curve SVG */}
      <div>
        <div className="label" style={{ color: 'var(--graphite)', marginBottom: 6 }}>
          SPEND CURVE · {label.toUpperCase()}
        </div>
        <svg width="100%" height="64" viewBox="0 0 400 64" preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="heroGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#6FA8B3" stopOpacity=".5" />
              <stop offset="1" stopColor="#6FA8B3" stopOpacity="0" />
            </linearGradient>
          </defs>
          {costSeries.length > 1 && (
            <>
              <path
                d={`M 0 64 ${costSeries.map((v, i) =>
                  `L ${(i / (costSeries.length - 1)) * 400} ${64 - (v / maxCost) * 58}`
                ).join(' ')} L 400 64 Z`}
                fill="url(#heroGrad)"
              />
              <path
                d={costSeries.map((v, i) =>
                  `${i === 0 ? 'M' : 'L'} ${(i / (costSeries.length - 1)) * 400} ${64 - (v / maxCost) * 58}`
                ).join(' ')}
                stroke="#9BC4CC" strokeWidth="1.4" fill="none"
              />
              <circle
                cx={400}
                cy={64 - (costSeries[costSeries.length - 1] / maxCost) * 58}
                r={2.5}
                fill="#C9966B"
              />
            </>
          )}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--steel)', marginTop: 2 }}>
          <span>start</span>
          <span>now</span>
        </div>
      </div>

      {/* Col 3: model mix bar */}
      <div>
        <div className="label" style={{ color: 'var(--graphite)', marginBottom: 6 }}>MIX BY MODEL</div>
        {mix.length > 0 ? (
          <>
            <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--line-2)' }}>
              {mix.map(m => (
                <div
                  key={m.k}
                  title={`${m.k} ${Math.round(m.v * 100)}%`}
                  style={{ width: `${m.v * 100}%`, background: m.c }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
              {mix.map(m => (
                <span key={m.k} style={{ color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, background: m.c, borderRadius: 1, flexShrink: 0 }} />
                  {m.k.split(' ')[1] ?? m.k}
                  <span style={{ color: 'var(--steel)' }}>{Math.round(m.v * 100)}%</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--steel)' }}>—</span>
        )}
      </div>
    </div>
  );
}
