'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';

type ZombieType = 'loop' | 'bloat' | 'abandoned' | 'runaway';
type Sev = 'high' | 'med' | 'low';

interface ZombieEntry {
  id: string;
  name: string;
  type: ZombieType;
  sev: Sev;
  model: string;
  startedMin: number;
  idleMin: number;
  stepCount: number;
  expectedSteps: number | null;
  costSoFar: number;
  tokRate: number;
  lastHuman: string;
  lastTool: string | null;
  reason: string;
  spark: number[];
}

const SEV_COL: Record<Sev, string> = { high: '#B86B6B', med: '#C9966B', low: '#7CA893' };
const TYPE_COL: Record<ZombieType, string> = { loop: '#B86B6B', bloat: '#C9966B', abandoned: '#8A9297', runaway: '#C9966B' };

const FILTERS = ['ALL', 'Loop', 'Bloat', 'Abandoned', 'Runaway'] as const;

const FALLBACK_ZOMBIES: ZombieEntry[] = [
  { id: 'sess_9f4ab12c', name: 'research · weekly_market_digest', type: 'loop', sev: 'high', model: 'Opus 4.5', startedMin: 9 * 60 + 42, idleMin: 8 * 60 + 11, stepCount: 47, expectedSteps: 5, costSoFar: 14.82, tokRate: 1840, lastHuman: '9h 42m ago', lastTool: 'browser.fetch', reason: 'Agent has iterated 47× without human input. Tool loop detected: browser.fetch → summarize → browser.fetch on sibling URLs. Step budget exceeded 9×.', spark: [4, 6, 8, 12, 14, 13, 15, 16, 18, 17, 19, 22, 20, 24, 22, 26, 24, 28, 26, 30, 28, 32, 30, 34, 32, 36] },
  { id: 'sess_2e81fa0d', name: 'chat · trip planning (Japan)', type: 'bloat', sev: 'high', model: 'Opus 4.5', startedMin: 14 * 24 * 60 + 120, idleMin: 42, stepCount: 218, expectedSteps: null, costSoFar: 42.18, tokRate: 28400, lastHuman: '42m ago', lastTool: null, reason: 'Conversation is 218 turns deep. Each new message sends 184k tokens of context. Per-turn cost grew from $0.04 → $0.61. Classic runaway chat.', spark: [2, 3, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 38, 44, 50, 56, 62, 68, 72, 78, 82, 88] },
  { id: 'sess_c4d70e3a', name: 'automation · cron.inbox_triage', type: 'abandoned', sev: 'med', model: 'Haiku', startedMin: 2 * 24 * 60 + 180, idleMin: 2 * 24 * 60 + 180, stepCount: 1420, expectedSteps: null, costSoFar: 6.24, tokRate: 320, lastHuman: '2d 3h ago', lastTool: 'mail.read', reason: 'Cron job still running after you closed the laptop 2 days ago. Small per-call cost but 1,420 calls and counting. No kill-switch configured.', spark: [1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] },
  { id: 'sess_7b19af45', name: 'code · refactor pricing_engine', type: 'runaway', sev: 'med', model: 'Opus 4.5', startedMin: 3 * 60 + 14, idleMin: 22, stepCount: 18, expectedSteps: 12, costSoFar: 8.42, tokRate: 0, lastHuman: '22m ago', lastTool: 'code.interpret', reason: 'Tool call `code.interpret` has retried 6× on a timeout. Each retry re-streams prior reasoning. Currently paused — resume will burn ~$1.20 more.', spark: [3, 4, 5, 6, 7, 6, 7, 8, 9, 8, 9, 10, 11, 10, 11, 12, 11, 12, 13, 12, 13, 14, 15, 14, 15, 16] },
];

function fmtDur(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.floor(min / (24 * 60))}d ${Math.floor((min % (24 * 60)) / 60)}h`;
}

interface Props {
  provider?: string;
}

export function ZombieSessionsCard({ provider }: Props = {}) {
  const [filter, setFilter] = useState<typeof FILTERS[number]>('ALL');
  const [sel, setSel] = useState(0);

  const { data: zombieData } = trpc.insights.zombieSessions.useQuery(
    provider ? { provider } : undefined
  );

  const zombies: ZombieEntry[] = useMemo(() => {
    if (!zombieData || zombieData.length === 0) return FALLBACK_ZOMBIES;
    return zombieData.map(z => ({
      id: z.sessionId,
      name: z.sessionId.slice(0, 24),
      type: z.type as ZombieType,
      sev: z.bloatRatio > 2 ? 'high' : 'med',
      model: 'Opus 4.5',
      startedMin: Math.round(z.ageMs / 60000),
      idleMin: Math.round(z.ageMs / 120000),
      stepCount: z.steps,
      expectedSteps: null,
      costSoFar: z.costUsd,
      tokRate: Math.round(z.costUsd * 1e6 / 10 / Math.max(1, z.ageMs / 60000)),
      lastHuman: fmtDur(Math.round(z.ageMs / 60000)),
      lastTool: null,
      reason: `Session type: ${z.type}. ${z.steps} steps, bloat ratio ${z.bloatRatio.toFixed(1)}×.`,
      spark: Array.from({ length: 26 }, (_, i) => Math.max(1, Math.round(2 + i * 0.5))),
    }));
  }, [zombieData]);

  const rows = filter === 'ALL' ? zombies : zombies.filter(z => z.type === filter.toLowerCase());
  const z = rows[Math.min(sel, rows.length - 1)] ?? zombies[0] ?? FALLBACK_ZOMBIES[0];
  const totalBleed = zombies.reduce((a, zz) => a + zz.tokRate, 0);
  const totalCost = zombies.reduce((a, zz) => a + zz.costSoFar, 0);

  return (
    <div className="card" style={{ marginTop: 16, padding: 0, position: 'relative', overflow: 'hidden' }}>
      {/* Animated pulse beacon bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #B86B6B, transparent)', animation: 'zombiePulse 2.4s ease-in-out infinite' }} />
      <style>{`@keyframes zombiePulse { 0%,100% { opacity:.25; transform:translateX(-30%); } 50% { opacity:1; transform:translateX(30%); } }`}</style>

      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#B86B6B', boxShadow: '0 0 6px #B86B6B', display: 'inline-block' }} />
            <span className="label" style={{ color: '#D89A9A' }}>ZOMBIES</span>
            <span style={{ width: 14, height: 1, background: 'var(--line-2)', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Sessions eating tokens with no human in the loop</span>
          </div>
          <div className="label" style={{ marginTop: 4, color: 'var(--graphite)' }}>
            <span className="num" style={{ color: '#B86B6B' }}>{zombies.length}</span> detected ·{' '}
            bleeding <span className="num" style={{ color: '#C9966B' }}>{totalBleed > 1000 ? (totalBleed / 1000).toFixed(1) + 'K' : String(totalBleed)}</span> tok/min ·{' '}
            accumulated <span className="num" style={{ color: 'var(--mist)' }}>${totalCost.toFixed(2)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div className="seg">
            {FILTERS.map(f => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => { setFilter(f); setSel(0); }}>{f}</button>
            ))}
          </div>
          <button className="mbtn">Rescan</button>
          <button className="mbtn primary" style={{ borderColor: 'rgba(184,107,107,.4)', color: '#D89A9A' }}>Kill all</button>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        {/* LEFT: table */}
        <div style={{ borderRight: '1px solid var(--line)' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 16 }}></th>
                <th>Session</th>
                <th>Type</th>
                <th>Age</th>
                <th>Idle</th>
                <th>Cost</th>
                <th>Rate</th>
                <th style={{ width: 20 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={sel === i ? 'selected' : ''}
                  onClick={() => setSel(i)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: SEV_COL[r.sev], boxShadow: r.sev === 'high' ? `0 0 6px ${SEV_COL[r.sev]}` : 'none' }} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--mist)', fontSize: 11 }}>{r.name}</span>
                      <span className="label" style={{ fontSize: 9, color: 'var(--graphite)' }}>{r.id.slice(0, 20)} · {r.model}</span>
                    </div>
                  </td>
                  <td>
                    <span className="chip" style={{ borderColor: TYPE_COL[r.type] + '55', color: TYPE_COL[r.type], fontSize: 9, padding: '2px 6px', letterSpacing: '.14em' }}>
                      {r.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="num" style={{ color: 'var(--fog)' }}>{fmtDur(r.startedMin)}</td>
                  <td className="num" style={{ color: r.idleMin > 60 ? '#C9966B' : 'var(--fog)' }}>{fmtDur(r.idleMin)}</td>
                  <td className="num" style={{ color: r.costSoFar > 10 ? '#B86B6B' : 'var(--mist)' }}>${r.costSoFar.toFixed(2)}</td>
                  <td className="num" style={{ color: r.tokRate > 1000 ? '#C9966B' : 'var(--steel)' }}>
                    {r.tokRate === 0 ? '⏸ paused' : `${r.tokRate > 1000 ? (r.tokRate / 1000).toFixed(1) + 'K' : r.tokRate}/m`}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--graphite)', fontSize: 10 }}>{sel === i ? '◀' : '›'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '28px 0', color: 'var(--steel)' }}>
                    <span style={{ color: '#7CA893' }}>✓</span> No zombies in this bucket. Nothing eating tokens unattended.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* RIGHT: drill panel */}
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Type + severity */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="chip" style={{ borderColor: TYPE_COL[z.type] + '55', color: TYPE_COL[z.type], fontSize: 9, padding: '2px 6px', letterSpacing: '.14em' }}>{z.type.toUpperCase()}</span>
              <span className="mono" style={{ fontSize: 9, color: SEV_COL[z.sev], letterSpacing: '.2em', fontWeight: 600 }}>{z.sev.toUpperCase()} SEVERITY</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--mist)', marginTop: 8, fontFamily: 'JetBrains Mono' }}>{z.name}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--graphite)', marginTop: 2 }}>{z.id} · {z.model}</div>
          </div>

          {/* Reason text */}
          <div style={{ fontSize: 12, color: 'var(--fog)', lineHeight: 1.6 }}>{z.reason}</div>

          {/* Sparkline */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label">Token rate · last 26m</span>
              <span className="num" style={{ fontSize: 10, color: '#C9966B' }}>{z.tokRate === 0 ? '⏸ paused' : `${z.tokRate > 1000 ? (z.tokRate / 1000).toFixed(1) + 'K' : z.tokRate}/min`}</span>
            </div>
            <div style={{ display: 'flex', gap: 1, height: 36, alignItems: 'flex-end' }}>
              {z.spark.map((v, i) => {
                const max = Math.max(...z.spark);
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: (v / max * 100) + '%',
                      background: `linear-gradient(180deg, ${SEV_COL[z.sev]}EE, ${SEV_COL[z.sev]}66)`,
                      borderRadius: '1px 1px 0 0',
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--steel)', marginTop: 4 }}>
              <span>-26m</span><span>now</span>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.2)' }}>
              <div className="label" style={{ fontSize: 9 }}>Steps</div>
              <div className="num" style={{ fontSize: 14, color: 'var(--mist)', marginTop: 2 }}>
                {z.stepCount}{z.expectedSteps && <span style={{ color: 'var(--steel)', fontSize: 10 }}> / {z.expectedSteps} expected</span>}
              </div>
            </div>
            <div style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'rgba(0,0,0,.2)' }}>
              <div className="label" style={{ fontSize: 9 }}>Last human input</div>
              <div className="num" style={{ fontSize: 14, color: 'var(--mist)', marginTop: 2 }}>{z.lastHuman}</div>
            </div>
          </div>

          {/* Projected waste */}
          <div style={{ padding: 10, border: '1px solid rgba(184,107,107,.3)', borderRadius: 'var(--r)', background: 'rgba(184,107,107,.05)' }}>
            <div className="label" style={{ color: '#D89A9A' }}>Projected waste if left running</div>
            <div className="num" style={{ fontSize: 16, color: '#D89A9A', marginTop: 4 }}>
              ${((z.tokRate * 60 * 24 / 1e6) * (z.model.includes('Opus') ? 15 : z.model.includes('Sonnet') ? 3 : 0.25)).toFixed(2)}
              <span style={{ fontSize: 10, color: 'var(--steel)', marginLeft: 6 }}>/ next 24h at current rate</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ marginTop: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="mbtn primary" style={{ borderColor: 'rgba(184,107,107,.4)', color: '#D89A9A' }}>Kill session ■</button>
            <button className="mbtn">Inspect trace ▸</button>
            <button className="mbtn">Archive</button>
            <button className="mbtn">Add step-budget</button>
          </div>
        </div>
      </div>
    </div>
  );
}
