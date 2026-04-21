'use client';

import { useState } from 'react';
import { fmtMs } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';

function colorFor(contentType: string): string {
  if (contentType === 'assistant_turn') return '#6FA8B3';  // reason
  if (contentType.startsWith('tool'))   return '#C9966B';  // tool
  return '#8A9297';                                         // IO
}

type ViewMode = 'Timeline' | 'Tree' | 'Raw';

interface Props {
  drill?: { type: string; source: string; stepHint?: number; at?: number } | null;
}

export function HowCard({ drill }: Props) {
  const [view, setView] = useState<ViewMode>('Timeline');
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [hover, setHover] = useState<{ step: { id: string; step: number; contentType: string; msOffset: number; latencyMs: number; inputTokens: number; outputTokens: number; model?: string | null }; x: number; y: number } | null>(null);

  const { data } = trpc.how.latestTrace.useQuery();

  const events = data?.events ?? [];
  const totalMs = events.length > 0
    ? events[events.length - 1].msOffset + events[events.length - 1].latencyMs
    : 2400;

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
    <div className="card" style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--line)'}}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <span className="label">HOW</span>
            <span style={{width:14, height:1, background:'var(--line-2)'}}/>
            <span style={{fontSize:13, fontWeight:500}}>Agent Trace</span>
            {drill && (
              <span className="chip" style={{borderColor:'var(--accent)', color:'var(--accent-2)'}}>&#9677; drilled from {drill.source}</span>
            )}
          </div>
          <div className="label" style={{marginTop:4, color:'var(--graphite)'}}>
            {data?.sessionId?.slice(0,8) && `trace · ${data.sessionId.slice(0,8)}… · `}{fmtMs(totalMs)} · {events.length} steps
          </div>
        </div>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          {/* Legend */}
          <div style={{display:'flex', gap:12, fontSize:10, color:'var(--steel)', letterSpacing:'.1em', textTransform:'uppercase'}}>
            <span style={{display:'flex', alignItems:'center', gap:5}}>
              <span style={{width:10, height:3, background:'#6FA8B3', display:'inline-block'}}/>Reason
            </span>
            <span style={{display:'flex', alignItems:'center', gap:5}}>
              <span style={{width:10, height:3, background:'#C9966B', display:'inline-block'}}/>Tool
            </span>
            <span style={{display:'flex', alignItems:'center', gap:5}}>
              <span style={{width:10, height:3, background:'#8A9297', display:'inline-block'}}/>IO
            </span>
          </div>
          {/* View toggle */}
          <div className="seg">
            {(['Timeline','Tree','Raw'] as ViewMode[]).map(v => (
              <button key={v} className={view===v?'on':''} onClick={()=>setView(v)}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline view */}
      {view === 'Timeline' && (
        <div style={{display:'grid', gridTemplateColumns:'minmax(0,1fr) 240px'}}>
          {/* LEFT: timeline */}
          <div style={{padding:'10px 14px', borderRight:'1px solid var(--line)'}}>
            {/* axis */}
            <div style={{display:'flex', justifyContent:'space-between', fontFamily:'JetBrains Mono', fontSize:9, color:'var(--steel)', marginLeft:180, marginBottom:4}}>
              <span>0</span><span>500</span><span>1000</span><span>1500</span>
              <span>{fmtMs(totalMs)}</span>
            </div>
            {/* waterfall rows */}
            {events.map(step => {
              const leftPct = totalMs > 0 ? (step.msOffset / totalMs) * 100 : 0;
              const widthPct = totalMs > 0 ? Math.max(0.5, (step.latencyMs / totalMs) * 100) : 0.5;
              const isSelected = selectedStep === step.step;
              const isDrillHighlight = drill?.stepHint === step.step;
              const col = colorFor(step.contentType);
              return (
                <div key={step.id}
                  onClick={() => setSelectedStep(isSelected ? null : step.step)}
                  onMouseEnter={e => setHover({step, x: e.clientX, y: e.clientY})}
                  onMouseMove={e => setHover({step, x: e.clientX, y: e.clientY})}
                  onMouseLeave={() => setHover(null)}
                  style={{display:'flex', alignItems:'center', height:22, position:'relative', cursor:'pointer',
                    background: isSelected ? 'rgba(111,168,179,.06)' : isDrillHighlight ? 'rgba(201,150,107,.06)' : 'transparent'}}>
                  {/* label column (180px) */}
                  <div style={{width:180, display:'flex', alignItems:'center', gap:6, paddingLeft: 8, fontSize:11,
                    color: isSelected ? 'var(--mist)' : 'var(--fog)', fontFamily:'JetBrains Mono', overflow:'hidden', whiteSpace:'nowrap'}}>
                    <span style={{color:'var(--graphite)', fontSize:9, width:16, display:'inline-block', flexShrink:0}}>
                      {String(step.step).padStart(2,'0')}
                    </span>
                    <span style={{overflow:'hidden', textOverflow:'ellipsis'}}>{step.contentType}</span>
                  </div>
                  {/* bar column */}
                  <div style={{position:'relative', flex:1, height:22}}>
                    {[.25,.5,.75].map((p,i) => (
                      <div key={i} style={{position:'absolute', left:(p*100)+'%', top:0, bottom:0, width:1, background:'rgba(138,146,151,.07)'}}/>
                    ))}
                    <div style={{
                      position:'absolute', left:`${leftPct}%`, width:`${widthPct}%`,
                      top:6, height:10,
                      background:`linear-gradient(180deg, ${col}, ${col}AA)`,
                      border:'1px solid rgba(233,236,236,.15)', borderRadius:2,
                      boxShadow: isSelected ? `0 0 0 1px ${col}` : 'inset 0 1px 0 rgba(255,255,255,.1)',
                    }}/>
                    <div style={{
                      position:'absolute', left:`calc(${leftPct + widthPct}% + 6px)`, top:4,
                      fontFamily:'JetBrains Mono', fontSize:10, color:'var(--steel)', whiteSpace:'nowrap'
                    }}>{fmtMs(step.latencyMs)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* RIGHT: step inspector */}
          <div style={{padding:14}}>
            {selectedStep !== null && (() => {
              const step = events.find(e => e.step === selectedStep);
              if (!step) return null;
              const col = colorFor(step.contentType);
              return (
                <>
                  <div className="label">Step detail</div>
                  <div style={{fontSize:12, fontFamily:'JetBrains Mono', color:'var(--mist)', marginTop:4}}>{step.contentType}</div>
                  <div style={{borderTop:'1px solid var(--line)', marginTop:8, paddingTop:8, display:'flex', flexDirection:'column', gap:6}}>
                    {([
                      ['Kind',     step.contentType],
                      ['Start',    `+${step.msOffset}ms`],
                      ['Duration', fmtMs(step.latencyMs)],
                      ['Tokens',   `${step.inputTokens} in · ${step.outputTokens} out`],
                      ['Cost',     `$${((step.inputTokens * 3 + step.outputTokens * 15) / 1e6).toFixed(4)}`],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{display:'flex', justifyContent:'space-between', fontSize:11}}>
                        <span style={{color:'var(--steel)', letterSpacing:'.06em', textTransform:'uppercase', fontSize:10}}>{k}</span>
                        <span className="num" style={{color:'var(--mist)'}}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:10, display:'flex', gap:8}}>
                    <button className="mbtn" onClick={() => {
                      const idx = events.findIndex(e => e.step === selectedStep);
                      const prevIdx = Math.max(0, idx - 1);
                      setSelectedStep(idx === 0 ? null : events[prevIdx]?.step ?? null);
                    }}>&#9666; Prev</button>
                    <button className="mbtn primary" style={{color: col}}>Open span &#9654;</button>
                  </div>
                </>
              );
            })()}
            {selectedStep === null && (
              <div style={{color:'var(--graphite)', fontSize:11, marginTop:8}}>Click a row to inspect</div>
            )}
          </div>
        </div>
      )}

      {/* Tree view */}
      {view === 'Tree' && (
        <div style={{padding:'18px 20px', color:'var(--graphite)', fontSize:11}}>
          <div style={{fontFamily:'JetBrains Mono', fontSize:10, lineHeight:2}}>
            {events.map((e, i) => (
              <div key={e.id} style={{paddingLeft: 8, color: colorFor(e.contentType)}}>
                {i === 0 ? '\u250C' : i === events.length-1 ? '\u2514' : '\u251C'} {String(e.step).padStart(2,'0')} {e.contentType} · {fmtMs(e.latencyMs)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw view */}
      {view === 'Raw' && (
        <div style={{padding:'14px 18px', fontFamily:'JetBrains Mono', fontSize:10, color:'var(--fog)', lineHeight:1.7, overflowX:'auto'}}>
          {events.map(e => (
            <div key={e.id} style={{borderBottom:'1px solid rgba(42,49,55,.5)', padding:'4px 0'}}>
              <span style={{color:'var(--graphite)', marginRight:12}}>+{e.msOffset}ms</span>
              <span style={{color: colorFor(e.contentType), marginRight:8}}>[{e.contentType}]</span>
              <span>in:{e.inputTokens} out:{e.outputTokens} dur:{fmtMs(e.latencyMs)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hover tooltip */}
      {hover && (
        <div className="tt" style={{left: hover.x + 14, top: hover.y + 8}}>
          <div className="label" style={{marginBottom:4}}>{hover.step.contentType}</div>
          <div style={{display:'flex', justifyContent:'space-between'}}><span>Start</span><span className="num">+{hover.step.msOffset}ms</span></div>
          <div style={{display:'flex', justifyContent:'space-between'}}><span>Duration</span><span className="num">{fmtMs(hover.step.latencyMs)}</span></div>
        </div>
      )}
    </div>
  );
}
