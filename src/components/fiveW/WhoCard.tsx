'use client';

import { useState, useMemo } from 'react';
import { fmt, fmtMs } from '@/lib/fmt';
import { type Lookback } from '@/lib/lookback';
import { Sparkline } from '@/components/shared/Sparkline';
import { trpc } from '@/lib/trpc-client';

type SortKey = 'tpm' | 'p50' | 'cost';

interface ModelRow {
  id: string;
  name: string;
  vendor: string;
  share: number;
  tpm: number;
  p50: number;
  p95: number;
  cost: number;
  err: number;
  col: string;
}

function modelColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus'))   return '#9BC4CC';
  if (m.includes('sonnet')) return '#6FA8B3';
  if (m.includes('haiku'))  return '#7CA893';
  if (m.includes('gemini')) return '#C9B08A';
  if (m.includes('grok'))   return '#B88A8A';
  if (m.includes('llama'))  return '#8A9297';
  return '#4A5358';
}

interface WhoCardProps {
  selected: string | null;
  setSelected: (id: string | null) => void;
  lookback: Lookback;
  providerFilter?: string;
  onDrill?: (m: ModelRow) => void;
}

export function WhoCard({ selected, setSelected, lookback, providerFilter, onDrill }: WhoCardProps) {
  const [simOn, setSimOn] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('tpm');

  const { data: modelData } = trpc.who.modelAttribution.useQuery({ lookback, provider: providerFilter });

  const models: ModelRow[] = useMemo(() => {
    if (!modelData || modelData.length === 0) return [];
    return modelData.map(m => ({
      id: m.model,
      name: m.model,
      vendor: m.provider,
      share: m.share / 100,
      tpm: m.calls,
      p50: m.avgLatMs,
      p95: m.p95LatMs,
      cost: m.cost,
      err: m.errorRatePct,
      col: modelColor(m.model),
    }));
  }, [modelData]);

  const sorted = useMemo(() => {
    return [...models].sort((a, b) => {
      if (sortKey === 'tpm')  return b.tpm - a.tpm;
      if (sortKey === 'p50')  return a.p50 - b.p50;
      if (sortKey === 'cost') return b.cost - a.cost;
      return 0;
    });
  }, [sortKey, models]);

  const totalTPM = models.reduce((s, m) => s + m.tpm, 0);

  if (!models.length) return (
    <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
    </div>
  );

  // Simulation: flash replaces opus
  const opusModel  = models.find(m => m.id.toLowerCase().includes('opus'))   ?? models[0];
  const flashModel = models.find(m => m.id.toLowerCase().includes('sonnet')) ?? models[1];
  const opusCost   = opusModel?.cost ?? 0;
  const simCost    = (flashModel && opusModel && flashModel.tpm > 0)
    ? flashModel.cost * (opusModel.tpm / flashModel.tpm)
    : 0;
  const savings    = opusCost - simCost;

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="label">WHO &middot; Model Attribution</span>
          <span className="chip">{models.length} active</span>
        </div>
        <button className={`mbtn${simOn ? ' primary' : ''}`} onClick={() => setSimOn(s => !s)}>
          &#8651; Simulate Switch
        </button>
      </div>

      {/* Simulation panel */}
      {simOn && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(79,123,131,.05)' }}>
          <div style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 10 }}>
            Opus 4.5 &rarr; Sonnet 4.5 swap simulation
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: '8px 10px', background: 'rgba(184,106,106,.08)', border: '1px solid rgba(184,106,106,.2)', borderRadius: 'var(--r)' }}>
              <div className="label" style={{ marginBottom: 4 }}>Opus Cost</div>
              <div className="num" style={{ fontSize: 18, color: 'var(--bad)' }}>${opusCost.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: 'var(--steel)' }}>current / {lookback}</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'rgba(124,168,147,.08)', border: '1px solid rgba(124,168,147,.2)', borderRadius: 'var(--r)' }}>
              <div className="label" style={{ marginBottom: 4 }}>Flash Sim</div>
              <div className="num" style={{ fontSize: 18, color: 'var(--good)' }}>${simCost.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: 'var(--steel)' }}>projected / {lookback}</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'rgba(111,168,179,.08)', border: '1px solid rgba(111,168,179,.2)', borderRadius: 'var(--r)' }}>
              <div className="label" style={{ marginBottom: 4 }}>Savings</div>
              <div className="num" style={{ fontSize: 18, color: 'var(--accent)' }}>${savings.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: 'var(--steel)' }}>per {lookback}</div>
            </div>
          </div>
          {/* Comparative bar */}
          <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${opusCost > 0 ? (simCost / opusCost) * 100 : 0}%`, background: 'linear-gradient(90deg, var(--good), var(--accent))', borderRadius: 3 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--steel)' }}>0</span>
            <span style={{ fontSize: 9, color: 'var(--steel)' }}>Simulated {opusCost > 0 ? ((simCost / opusCost) * 100).toFixed(0) : 0}% of current</span>
            <span style={{ fontSize: 9, color: 'var(--steel)' }}>${opusCost.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Share bar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
        <div className="label" style={{ marginBottom: 6 }}>Traffic share</div>
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1 }}>
          {models.map(m => (
            <div
              key={m.id}
              title={m.name}
              style={{
                flex: m.share,
                background: m.col,
                opacity: selected && selected !== m.id ? 0.35 : 0.85,
                cursor: 'pointer',
                transition: 'opacity .15s',
              }}
              onClick={() => setSelected(selected === m.id ? null : m.id)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          {models.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: selected && selected !== m.id ? .4 : 1 }}
              onClick={() => setSelected(selected === m.id ? null : m.id)}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: m.col, display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: 'var(--fog)' }}>{m.name.split(' ')[1] ?? m.name}</span>
              <span className="num" style={{ fontSize: 10, color: 'var(--steel)' }}>{(m.share * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th style={{ cursor: 'pointer', color: sortKey === 'tpm' ? 'var(--accent)' : undefined }} onClick={() => setSortKey('tpm')}>
                TPM {sortKey === 'tpm' ? '▼' : ''}
              </th>
              <th style={{ cursor: 'pointer', color: sortKey === 'p50' ? 'var(--accent)' : undefined }} onClick={() => setSortKey('p50')}>
                p50 {sortKey === 'p50' ? '▼' : ''}
              </th>
              <th>p95</th>
              <th style={{ cursor: 'pointer', color: sortKey === 'cost' ? 'var(--accent)' : undefined }} onClick={() => setSortKey('cost')}>
                Cost/d {sortKey === 'cost' ? '▼' : ''}
              </th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => {
              const isOpus = m.id.toLowerCase().includes('opus');
              const scaledCost = m.cost;
              const trend: number[] = [];
              const isSelected = selected === m.id;
              return (
                <tr
                  key={m.id}
                  className={isSelected ? 'selected' : ''}
                  onClick={() => {
                    setSelected(isSelected ? null : m.id);
                    onDrill?.(m);
                  }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: m.col, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: 12 }}>{m.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--steel)', marginLeft: 15 }}>{m.vendor}</div>
                  </td>
                  <td className="num">{fmt(m.tpm)}</td>
                  <td className="num">{fmtMs(m.p50)}</td>
                  <td className="num">{fmtMs(m.p95)}</td>
                  <td>
                    {simOn && isOpus ? (
                      <div>
                        <span className="num" style={{ textDecoration: 'line-through', color: 'var(--steel)', fontSize: 11 }}>
                          ${scaledCost.toFixed(2)}
                        </span>{' '}
                        <span className="num" style={{ color: 'var(--good)', fontSize: 11 }}>
                          ${simCost.toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span className="num">{scaledCost > 0 ? `$${scaledCost.toFixed(2)}` : <span style={{ color: 'var(--steel)' }}>free</span>}</span>
                    )}
                  </td>
                  <td>
                    <Sparkline data={trend} color={m.col} h={28} w={80} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
