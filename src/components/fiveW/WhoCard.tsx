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
      <div style={{padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--line)'}}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <span className="label">WHO</span>
            <span style={{width:14, height:1, background:'var(--line-2)'}}/>
            <span style={{fontSize:13, fontWeight:500}}>Model Attribution</span>
          </div>
          <div className="label" style={{marginTop:4, color:'var(--graphite)'}}>
            {models.length} active · {lookback} window
          </div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <button className={`mbtn${simOn?' primary':''}`} onClick={() => setSimOn(s => !s)}>
            {simOn ? '● SIM ACTIVE' : '⇌ Simulate Switch'}
          </button>
          <span className="chip"><span className="dot" style={{background:'var(--accent)'}}/>{models.length} active</span>
        </div>
      </div>

      {/* Simulation panel */}
      {simOn && (
        <div style={{borderBottom:'1px solid var(--line)', padding:'14px 18px', background:'linear-gradient(180deg, rgba(124,168,147,.08), rgba(124,168,147,.02))'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span className="label" style={{color:'var(--good)'}}>What-if</span>
              <span style={{fontSize:12, color:'var(--mist)'}}>Route {opusModel?.name ?? 'Opus'} → {flashModel?.name ?? 'Sonnet'}</span>
            </div>
            <button className="mbtn" onClick={() => setSimOn(false)} style={{padding:'3px 8px'}}>✕</button>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
            <div style={{padding:10, border:'1px solid var(--line)', borderRadius:'var(--r)', background:'rgba(0,0,0,.2)'}}>
              <div className="label" style={{fontSize:9}}>Current ({opusModel?.name ?? 'Opus'})</div>
              <div className="num" style={{fontSize:18, color:'var(--fog)', marginTop:2}}>${opusCost.toFixed(2)}</div>
              <div className="label" style={{fontSize:9, color:'var(--graphite)', marginTop:2}}>p50 {opusModel?.p50 ?? 0}ms</div>
            </div>
            <div style={{padding:10, border:'1px solid rgba(124,168,147,.4)', borderRadius:'var(--r)', background:'rgba(124,168,147,.08)'}}>
              <div className="label" style={{fontSize:9, color:'var(--good)'}}>Simulated ({flashModel?.name ?? 'Sonnet'})</div>
              <div className="num" style={{fontSize:18, color:'var(--mist)', marginTop:2}}>${simCost.toFixed(2)}</div>
              <div className="label" style={{fontSize:9, color:'var(--graphite)', marginTop:2}}>p50 {flashModel?.p50 ?? 0}ms · quality est.</div>
            </div>
            <div style={{padding:10, border:'1px solid rgba(155,196,204,.4)', borderRadius:'var(--r)', background:'rgba(111,168,179,.08)'}}>
              <div className="label" style={{fontSize:9, color:'var(--accent-2)'}}>Savings</div>
              <div className="num" style={{fontSize:18, color:'var(--accent-2)', marginTop:2}}>${savings.toFixed(2)}</div>
              <div className="label" style={{fontSize:9, color:'var(--graphite)', marginTop:2}}>
                −{opusCost > 0 ? ((savings/opusCost)*100).toFixed(1) : '0.0'}% of Opus spend
              </div>
            </div>
          </div>
          {/* Comparative bar */}
          <div style={{marginTop:10}}>
            <div style={{position:'relative', height:18, border:'1px solid var(--line-2)', borderRadius:2, background:'var(--ink)', overflow:'hidden'}}>
              <div style={{position:'absolute', left:0, top:0, bottom:0, width:'100%', background:'linear-gradient(90deg,#9BC4CC,#6FA8B3)', opacity:.45}}/>
              <div style={{position:'absolute', left:0, top:0, bottom:0, width:(opusCost>0?(simCost/opusCost*100):0)+'%', background:'linear-gradient(90deg,#7CA893,#5E8B78)'}}/>
              <div style={{position:'absolute', right:6, top:2, fontFamily:'JetBrains Mono', fontSize:10, color:'var(--mist)'}}>
                {opusModel?.name ?? 'Opus'} baseline
              </div>
              <div style={{position:'absolute', left:6, top:2, fontFamily:'JetBrains Mono', fontSize:10, color:'var(--mist)'}}>
                {flashModel?.name ?? 'Sonnet'}
              </div>
            </div>
          </div>
          <div className="label" style={{marginTop:8, color:'var(--graphite)', fontSize:9, lineHeight:1.5}}>
            Estimate uses output-token pricing × workload over {lookback}. Quality delta is an estimate only.
          </div>
        </div>
      )}

      {/* Share bar */}
      <div style={{padding:'14px 18px 6px', borderBottom:'1px solid var(--line)'}}>
        <div className="label" style={{marginBottom:6}}>Share of volume</div>
        <div style={{display:'flex', height:12, borderRadius:2, overflow:'hidden', border:'1px solid var(--line-2)'}}>
          {sorted.map(m => (
            <div key={m.id}
              onClick={() => setSelected(selected === m.id ? null : m.id)}
              title={m.name}
              style={{
                width: (m.tpm / totalTPM * 100) + '%',
                background: `linear-gradient(180deg, ${m.col}, ${m.col}CC)`,
                borderRight: '1px solid rgba(0,0,0,.4)',
                opacity: selected && selected !== m.id ? .35 : 1,
                cursor: 'pointer',
                transition: 'opacity .15s'
              }}/>
          ))}
        </div>
        <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontFamily:'JetBrains Mono', fontSize:9, color:'var(--steel)'}}>
          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
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
                  <td className="num" style={{color:'var(--mist)'}}>
                    {simOn && isOpus ? (
                      <span>
                        <span style={{color:'var(--graphite)', textDecoration:'line-through', marginRight:6}}>
                          ${m.cost.toFixed(2)}
                        </span>
                        <span style={{color:'var(--good)'}}>${simCost.toFixed(2)}</span>
                      </span>
                    ) : `$${m.cost.toFixed(2)}`}
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
