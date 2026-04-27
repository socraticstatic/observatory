'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc-client';

type Level = 'ok' | 'warn' | 'bad';

const LVL_COLOR: Record<Level, string> = {
  ok:   '#7CA893',
  warn: '#C9966B',
  bad:  '#B86B6B',
};

function RiskGauge({ score }: { score: number }) {
  const R = 58, CX = 80, CY = 68;
  const START = -210, END = 30;
  const toRad = (d: number) => d * Math.PI / 180;
  const pt = (deg: number) => ({ x: CX + R * Math.cos(toRad(deg)), y: CY + R * Math.sin(toRad(deg)) });
  const deg = START + (END - START) * (score / 100);
  const a = pt(START), b = pt(END), n = pt(deg);

  const ticks = Array.from({ length: 21 }, (_, i) => {
    const d = START + (END - START) * (i / 20);
    const p1 = pt(d);
    const p2 = { x: CX + (R - 6) * Math.cos(toRad(d)), y: CY + (R - 6) * Math.sin(toRad(d)) };
    return { p1, p2, major: i % 5 === 0 };
  });

  const color    = score < 35 ? '#7CA893' : score < 70 ? '#C9966B' : '#B86B6B';
  const labelTxt = score < 35 ? 'NOMINAL'  : score < 70 ? 'ELEVATED' : 'HIGH';

  return (
    <svg width="160" height="104" viewBox="0 0 160 104" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="gaugeArc" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0"  stopColor="#7CA893" />
          <stop offset=".5" stopColor="#C9966B" />
          <stop offset="1"  stopColor="#B86B6B" />
        </linearGradient>
      </defs>
      <path d={`M ${a.x} ${a.y} A ${R} ${R} 0 1 1 ${b.x} ${b.y}`}
        stroke="rgba(138,146,151,.18)" strokeWidth="10" fill="none" strokeLinecap="butt" />
      <path d={`M ${a.x} ${a.y} A ${R} ${R} 0 ${deg - START > 180 ? 1 : 0} 1 ${n.x} ${n.y}`}
        stroke="url(#gaugeArc)" strokeWidth="10" fill="none" strokeLinecap="butt" />
      {ticks.map((t, i) => (
        <line suppressHydrationWarning key={`tick-${i}`} x1={t.p1.x} y1={t.p1.y} x2={t.p2.x} y2={t.p2.y}
          stroke={t.major ? 'rgba(233,236,236,.35)' : 'rgba(138,146,151,.2)'}
          strokeWidth={t.major ? 1 : 0.6} />
      ))}
      <line suppressHydrationWarning x1={CX} y1={CY} x2={n.x} y2={n.y} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={4} fill={color} stroke="rgba(0,0,0,.4)" />
      <circle cx={CX} cy={CY} r={1.5} fill="#11171B" />
      <text x={CX} y={CY + 22} textAnchor="middle" fill={color}
        fontFamily="JetBrains Mono, monospace" fontSize="20" fontWeight="600">{score}</text>
      <text x={CX} y={CY + 36} textAnchor="middle" fill="var(--steel)"
        fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing="2">{labelTxt}</text>
    </svg>
  );
}

function SensitivityBar({ buckets }: { buckets: { sev: number }[] }) {
  return (
    <svg width="100%" height="48" preserveAspectRatio="none" viewBox="0 0 300 48" style={{ display: 'block' }}>
      {buckets.map((b, i) => {
        const sev = isNaN(b.sev) || !isFinite(b.sev) ? 0 : b.sev;
        const x = (i / buckets.length) * 300;
        const w = 300 / buckets.length - 0.6;
        const h = Math.max(2, sev * 44);
        const c = sev < 0.35 ? '#7CA893' : sev < 0.7 ? '#C9966B' : '#B86B6B';
        return <rect suppressHydrationWarning key={`bucket-${i}`} x={x} y={48 - h - 2} width={w} height={h} fill={c} opacity={0.55 + sev * 0.4} />;
      })}
    </svg>
  );
}

export function SecurityTerminal() {
  const [filter, setFilter] = useState('ALL');
  const [cursor, setCursor] = useState(true);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = trpc.insights.sessionAnomalies.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const t = setInterval(() => setCursor(v => !v), 600);
    return () => clearInterval(t);
  }, []);

  const events   = data?.events ?? [];
  const riskScore = data?.riskScore ?? 0;
  const tokenBuckets = data?.tokenBuckets ?? Array.from({ length: 60 }, () => ({ sev: 0 }));
  const counts   = data?.counts ?? { errors: 0, costHigh: 0, spikes: 0, cacheHits: 0 };

  const filtered = filter === 'ALL'
    ? events
    : events.filter(e => e.tag.startsWith(filter));

  function handleSnapshot() {
    navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleExport() {
    const jsonl = filtered.map(e => JSON.stringify(e)).join('\n');
    const blob = new Blob([jsonl], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `observatory-events-${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card" style={{ padding: 0, marginTop: 16, overflow: 'hidden', fontFamily: "'JetBrains Mono', monospace" }}>
      {/* terminal header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(180deg,#10161A,#0C1115)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <span key={`dot-${i}`} style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a4249', border: '1px solid #4A5358', display: 'inline-block' }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--accent-2)', fontSize: 11, letterSpacing: '.14em' }}>~/</span>
          <span style={{ color: 'var(--mist)', fontSize: 12, fontWeight: 600, letterSpacing: '.08em' }}>security@observatory</span>
          <span className="chip" style={{ fontFamily: "'JetBrains Mono', monospace", background: 'rgba(184,107,107,.08)', borderColor: 'rgba(184,107,107,.4)', color: '#D89A9A' }}>
            ⬤ LIVE
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="seg" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {['ALL', 'STATUS', 'COST', 'OUTPUT', 'CACHE', 'INFERENCE'].map(f => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <button className="mbtn" onClick={handleSnapshot} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {copied ? '✓ Copied' : '⇧ snapshot'}
        </button>
        <button className="mbtn" onClick={handleExport} style={{ fontFamily: "'JetBrains Mono', monospace" }}>↯ export .jsonl</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        {/* LEFT - event feed */}
        <div style={{ background: '#0A0F12', borderRight: '1px solid var(--line)', position: 'relative', minHeight: 360, maxHeight: 420, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(111,168,179,.03) 0 2px, transparent 2px 4px)', pointerEvents: 'none' }} />
          <div style={{ padding: '12px 16px 4px', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--steel)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
            <span>⬦ session.stream · {filtered.length} events · 60m window</span>
            <span>live · 15s refresh</span>
          </div>

          {isLoading && events.length === 0 && (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--graphite)', fontSize: 11 }}>
              Loading session events…
            </div>
          )}

          {isError && (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 11 }}>
              <span style={{ color: '#B86B6B', fontWeight: 600 }}>[ERROR]</span>
              <span style={{ color: 'var(--graphite)', marginLeft: 8 }}>Failed to load session anomalies. Check DB connection.</span>
            </div>
          )}

          {!isLoading && !isError && events.length === 0 && (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--graphite)', fontSize: 11 }}>
              No session events in the last hour.
            </div>
          )}

          <div style={{ padding: '4px 16px 14px', overflow: 'auto', maxHeight: 380, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, lineHeight: 1.55 }}>
            {filtered.map((e, i) => (
              <div key={e.id ?? i} style={{ display: 'grid', gridTemplateColumns: '72px 92px 120px 1fr', gap: 10, padding: '3px 0', borderBottom: '1px dashed rgba(138,146,151,.08)', color: 'var(--fog)' }}>
                <span style={{ color: 'var(--graphite)' }}>{e.t}</span>
                <span style={{ color: LVL_COLOR[e.lvl as Level], fontWeight: 600 }}>
                  {e.lvl === 'ok' ? '[ OK  ]' : e.lvl === 'warn' ? '[WARN ]' : '[ERROR]'}
                </span>
                <span style={{ color: 'var(--mist)' }}>{e.tag}</span>
                <span>
                  <span style={{ color: 'var(--fog)' }}>{e.msg}</span>
                  {e.src && <span style={{ color: 'var(--graphite)', marginLeft: 8 }}>@ {e.src}{e.span && ' ' + e.span}</span>}
                </span>
              </div>
            ))}
            <div style={{ color: 'var(--accent-2)', marginTop: 6 }}>
              $ observe --stream session_anomalies --window 60m
              <span style={{ display: 'inline-block', width: 8, height: 14, background: cursor ? 'var(--accent-2)' : 'transparent', marginLeft: 4, verticalAlign: '-2px' }} />
            </div>
          </div>
        </div>

        {/* RIGHT - gauge + sensitivity + counters */}
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14, background: 'linear-gradient(180deg,#0F1518,#0B1014)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <RiskGauge score={riskScore} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.18em', textTransform: 'uppercase' }}>Anomaly Score · 60m</div>
              <div style={{ fontSize: 11, color: 'var(--fog)', marginTop: 4, lineHeight: 1.5 }}>
                Weighted by error rate, cost spikes, and token anomalies. Updated every 15s.
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--steel)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>
              <span>Token volume · tokens/min</span>
              <span style={{ color: 'var(--graphite)' }}>←60m → now</span>
            </div>
            <SensitivityBar buckets={tokenBuckets} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--graphite)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
              <span>low</span><span>medium</span><span>high</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { k: 'Errors',       v: counts.errors,   c: '#B86B6B' },
              { k: 'Cost spikes',  v: counts.costHigh, c: '#C9966B' },
              { k: 'Token spikes', v: counts.spikes,   c: '#C9966B' },
              { k: 'Cache hits',   v: counts.cacheHits, c: '#7CA893' },
            ] as const).map(s => (
              <div key={s.k} style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.25)' }}>
                <div style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--steel)' }}>{s.k}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 600, color: s.c, fontFamily: "'JetBrains Mono', monospace" }}>{s.v}</span>
                  <span style={{ fontSize: 10, color: 'var(--graphite)' }}>last 60m</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.15)' }}>
            <div style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
              ⬦ Data source
            </div>
            <div style={{ fontSize: 11, color: 'var(--graphite)', marginTop: 4, lineHeight: 1.5 }}>
              Derived from <span style={{ color: 'var(--fog)' }}>llm_events</span>. Monitors errors, cost anomalies, and token spikes. PII/injection detection requires a proxy layer.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
