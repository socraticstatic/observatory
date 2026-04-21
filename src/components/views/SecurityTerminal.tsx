'use client';

import { useState, useEffect, useMemo } from 'react';

const SEED_EVENTS = [
  { t: '14:32:04', lvl: 'ok'   as const, tag: 'PII.MASK',     msg: 'email redacted · rule:rfc5322 · ███@███.com',                        src: 'session/inbox_triage', span: '#2' },
  { t: '14:31:52', lvl: 'warn' as const, tag: 'INJECT?',      msg: 'suspected prompt override in tool output · "ignore previous…"',      src: 'tool.web_search',      span: '#3' },
  { t: '14:31:41', lvl: 'ok'   as const, tag: 'PII.MASK',     msg: 'SSN ███-██-████ scrubbed · rule:us-ssn',                            src: 'agent.plan',           span: '#1' },
  { t: '14:31:22', lvl: 'ok'   as const, tag: 'POLICY',       msg: 'outbound call allowed · domain:arxiv.org',                           src: 'tool.browser.fetch',   span: '#3' },
  { t: '14:30:58', lvl: 'bad'  as const, tag: 'INJECT.BLOCK', msg: 'jailbreak attempt blocked · DAN.v12 signature',                      src: 'user.prompt',          span: '#0' },
  { t: '14:30:31', lvl: 'warn' as const, tag: 'PII.LEAK?',    msg: 'credit card fragment detected in model output · confidence 0.72',    src: 'agent.reason',         span: '#4' },
  { t: '14:30:04', lvl: 'ok'   as const, tag: 'PII.MASK',     msg: 'phone number +1-███-███-████ redacted',                             src: 'tool.gmail.list',      span: '#1' },
  { t: '14:29:48', lvl: 'ok'   as const, tag: 'ENCRYPT',      msg: 'ephemeral key rotated · kid:7c4f…9a1b',                              src: 'system',               span: ''   },
  { t: '14:29:22', lvl: 'warn' as const, tag: 'INJECT?',      msg: 'zero-width unicode steganography · U+200B cluster',                  src: 'tool.browser.fetch',   span: '#3' },
  { t: '14:28:51', lvl: 'ok'   as const, tag: 'PII.MASK',     msg: 'api_key sk-████████ stripped before inference',                     src: 'agent.rewrite',        span: '#3' },
  { t: '14:28:14', lvl: 'bad'  as const, tag: 'EXFIL.BLOCK',  msg: 'attempted base64 payload in output · 1.2KB blocked',                src: 'agent.summarize',      span: '#5' },
  { t: '14:27:42', lvl: 'ok'   as const, tag: 'POLICY',       msg: 'model claude-opus-4.5 · region:us-east-1 · compliant',              src: 'system',               span: ''   },
];

type Level = 'ok' | 'warn' | 'bad';

interface Event {
  t: string;
  lvl: Level;
  tag: string;
  msg: string;
  src: string;
  span: string;
}

const LIVE_POOL: Omit<Event, 't'>[] = [
  { lvl: 'ok',   tag: 'PII.MASK',    msg: 'email ███@███.com redacted · rule:rfc5322',          src: 'agent.reason',       span: '#4' },
  { lvl: 'warn', tag: 'INJECT?',     msg: 'indirect injection via markdown link · href probe',   src: 'tool.web_search',    span: '#2' },
  { lvl: 'ok',   tag: 'POLICY',      msg: 'outbound call allowed · domain:github.com',           src: 'tool.browser.fetch', span: '#3' },
  { lvl: 'bad',  tag: 'EXFIL.BLOCK', msg: 'hex-encoded payload dropped · 842B',                 src: 'agent.summarize',    span: '#8' },
];

const LVL_COLOR: Record<Level, string> = {
  ok:   '#7CA893',
  warn: '#C9966B',
  bad:  '#B86B6B',
};

function makeRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

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
        <line key={i} x1={t.p1.x} y1={t.p1.y} x2={t.p2.x} y2={t.p2.y}
          stroke={t.major ? 'rgba(233,236,236,.35)' : 'rgba(138,146,151,.2)'}
          strokeWidth={t.major ? 1 : 0.6} />
      ))}
      <line x1={CX} y1={CY} x2={n.x} y2={n.y} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
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
        const x = (i / buckets.length) * 300;
        const w = 300 / buckets.length - 0.6;
        const h = Math.max(2, b.sev * 44);
        const c = b.sev < 0.35 ? '#7CA893' : b.sev < 0.7 ? '#C9966B' : '#B86B6B';
        return <rect key={i} x={x} y={48 - h - 2} width={w} height={h} fill={c} opacity={0.55 + b.sev * 0.4} />;
      })}
    </svg>
  );
}

export function SecurityTerminal() {
  const [events, setEvents] = useState<Event[]>(SEED_EVENTS);
  const [filter, setFilter] = useState('ALL');
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setCursor(v => !v), 600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date();
      const stamp = now.toTimeString().slice(0, 8);
      const pick = LIVE_POOL[Math.floor(Math.random() * LIVE_POOL.length)];
      setEvents(ev => [{ t: stamp, ...pick }, ...ev].slice(0, 40));
    }, 4200);
    return () => clearInterval(t);
  }, []);

  const sensitivityBuckets = useMemo(() => {
    const r = makeRng(77);
    return Array.from({ length: 60 }, (_, i) => {
      const base = 0.25 + 0.55 * Math.sin(i / 9 + 1) ** 2;
      const sev = Math.max(0, Math.min(1, base + (r() - 0.5) * 0.4 + (i === 42 ? 0.4 : 0) + (i === 54 ? 0.5 : 0)));
      return { sev };
    });
  }, []);

  const riskScore = useMemo(
    () => Math.round(sensitivityBuckets.reduce((a, b) => a + b.sev, 0) / sensitivityBuckets.length * 100),
    [sensitivityBuckets],
  );

  const counts = {
    mask:   events.filter(e => e.tag.startsWith('PII.MASK')).length,
    leak:   events.filter(e => e.tag === 'PII.LEAK?').length,
    inject: events.filter(e => e.tag.startsWith('INJECT')).length,
    block:  events.filter(e => e.tag.endsWith('BLOCK')).length,
  };

  const filtered = filter === 'ALL' ? events : events.filter(e => e.tag.startsWith(filter));

  return (
    <div className="card" style={{ padding: 0, marginTop: 16, overflow: 'hidden', fontFamily: "'JetBrains Mono', monospace" }}>
      {/* terminal header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(180deg,#10161A,#0C1115)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a4249', border: '1px solid #4A5358', display: 'inline-block' }} />
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
          {['ALL', 'PII', 'INJECT', 'POLICY', 'EXFIL'].map(f => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <button className="mbtn" style={{ fontFamily: "'JetBrains Mono', monospace" }}>⇧ snapshot</button>
        <button className="mbtn" style={{ fontFamily: "'JetBrains Mono', monospace" }}>↯ export .jsonl</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        {/* LEFT - event feed */}
        <div style={{ background: '#0A0F12', borderRight: '1px solid var(--line)', position: 'relative', minHeight: 360, maxHeight: 420, overflow: 'hidden' }}>
          {/* scanline sheen */}
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(111,168,179,.03) 0 2px, transparent 2px 4px)', pointerEvents: 'none' }} />
          <div style={{ padding: '12px 16px 4px', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--steel)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
            <span>⬦ detection.stream · {filtered.length} events</span>
            <span>buf 128 · 90d retention</span>
          </div>
          <div style={{ padding: '4px 16px 14px', overflow: 'auto', maxHeight: 380, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, lineHeight: 1.55 }}>
            {filtered.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '72px 76px 100px 1fr', gap: 10, padding: '3px 0', borderBottom: '1px dashed rgba(138,146,151,.08)', color: 'var(--fog)' }}>
                <span style={{ color: 'var(--graphite)' }}>{e.t}</span>
                <span style={{ color: LVL_COLOR[e.lvl], fontWeight: 600 }}>
                  {e.lvl === 'ok' ? '[ OK  ]' : e.lvl === 'warn' ? '[WARN ]' : '[BLOCK]'}
                </span>
                <span style={{ color: 'var(--mist)' }}>{e.tag}</span>
                <span>
                  <span style={{ color: 'var(--fog)' }}>{e.msg}</span>
                  {e.src && <span style={{ color: 'var(--graphite)', marginLeft: 8 }}>@ {e.src}{e.span && ' ' + e.span}</span>}
                </span>
              </div>
            ))}
            <div style={{ color: 'var(--accent-2)', marginTop: 6 }}>
              $ observe --stream pii,inject,exfil
              <span style={{ display: 'inline-block', width: 8, height: 14, background: cursor ? 'var(--accent-2)' : 'transparent', marginLeft: 4, verticalAlign: '-2px' }} />
            </div>
          </div>
        </div>

        {/* RIGHT - gauge + sensitivity + counters */}
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14, background: 'linear-gradient(180deg,#0F1518,#0B1014)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <RiskGauge score={riskScore} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.18em', textTransform: 'uppercase' }}>Risk Score · 60m</div>
              <div style={{ fontSize: 11, color: 'var(--fog)', marginTop: 4, lineHeight: 1.5 }}>
                Weighted by token sensitivity, injection attempts, and policy hits. Updated every 5s.
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <span className="chip" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Δ +4 vs 60m</span>
                <span className="chip" style={{ fontFamily: "'JetBrains Mono', monospace" }}>p95 23</span>
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--steel)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>
              <span>Sensitivity · tokens/min</span>
              <span style={{ color: 'var(--graphite)' }}>←60m → now</span>
            </div>
            <SensitivityBar buckets={sensitivityBuckets} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--graphite)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
              <span>low</span><span>medium</span><span>high</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { k: 'PII masked',      v: counts.mask,   c: '#7CA893' },
              { k: 'Leak candidates', v: counts.leak,   c: '#C9966B' },
              { k: 'Injection probes',v: counts.inject, c: '#C9966B' },
              { k: 'Blocked',         v: counts.block,  c: '#B86B6B' },
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

          <div style={{ padding: '10px 12px', border: '1px solid rgba(184,107,107,.35)', borderRadius: 'var(--r)', background: 'rgba(184,107,107,.05)' }}>
            <div style={{ fontSize: 10, color: '#D89A9A', letterSpacing: '.14em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
              <span>⚠ Active advisory</span>
              <span style={{ color: 'var(--graphite)' }}>2m ago</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--fog)', marginTop: 4, lineHeight: 1.5 }}>
              Two high-confidence prompt-injection patterns observed from{' '}
              <span style={{ color: 'var(--mist)' }}>tool.web_search</span> output.
              Sandbox quarantine recommended until ruleset update.
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <button className="mbtn primary" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Isolate</button>
              <button className="mbtn" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Open playbook</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
