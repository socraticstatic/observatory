'use client';

import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc-client';
import { fmtMs } from '@/lib/fmt';
import type { Lookback } from '@/lib/lookback';

interface Props { lookback: Lookback; provider?: string; }

const WINDOW_MS: Record<Lookback, number> = {
  '1H':  3_600_000,
  '24H': 86_400_000,
  '30D': 30 * 86_400_000,
  '90D': 90 * 86_400_000,
  '1Y':  365 * 86_400_000,
};

function modelColor(model: string): string {
  if (model.includes('opus'))   return 'var(--accent)';
  if (model.includes('sonnet')) return '#C9966B';
  if (model.includes('haiku'))  return 'var(--good)';
  if (model.includes('gpt-4'))  return '#74AA9C';
  if (model.includes('gemini')) return '#A8A074';
  return 'var(--steel)';
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.001) return `<$0.001`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000)      return `${ms}ms`;
  if (ms < 60_000)    return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

type SessionVerdict = 'ok' | 'watch' | 'act';

function sessionVerdict(s: {
  callCount: number; errorCount: number; totalCost: number;
  cacheHitPct: number; tokenGrowthRatio: number;
}): SessionVerdict {
  const errorRate   = s.callCount > 0 ? s.errorCount / s.callCount : 0;
  const costPerCall = s.callCount > 0 ? s.totalCost  / s.callCount : 0;
  // Runaway: deep session with exploding context, or majority errors
  if (errorRate > 0.3 || (s.callCount > 8 && s.tokenGrowthRatio > 2.5)) return 'act';
  // Watch: moderate errors, uncached context, expensive per call
  if (errorRate > 0.05 || s.cacheHitPct < 20 || costPerCall > 1.0) return 'watch';
  return 'ok';
}

const VERDICT_STYLE: Record<SessionVerdict, React.CSSProperties> = {
  act:   { fontSize: 8, fontWeight: 700, letterSpacing: '.12em', color: 'var(--bad)',  background: 'rgba(184,107,107,.12)', border: '1px solid rgba(184,107,107,.3)', borderRadius: 'var(--r)', padding: '1px 5px' },
  watch: { fontSize: 8, fontWeight: 700, letterSpacing: '.12em', color: '#C9966B',    background: 'rgba(201,150,107,.1)',   border: '1px solid rgba(201,150,107,.25)', borderRadius: 'var(--r)', padding: '1px 5px' },
  ok:    {},
};

function LabelCell({ sessionId }: { sessionId: string }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: label, refetch } = trpc.sessionLabels.get.useQuery({ sessionId });
  const setLabel = trpc.sessionLabels.set.useMutation({ onSuccess: () => { refetch(); setEditing(false); } });
  const delLabel = trpc.sessionLabels.delete.useMutation({ onSuccess: () => { refetch(); } });

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(label ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 10);
  }

  function save(e: React.KeyboardEvent | React.FocusEvent) {
    if ('key' in e && e.key === 'Escape') { setEditing(false); return; }
    if ('key' in e && e.key !== 'Enter') return;
    const trimmed = draft.trim();
    if (!trimmed) {
      if (label) delLabel.mutate({ sessionId });
      else setEditing(false);
    } else {
      setLabel.mutate({ sessionId, label: trimmed });
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={save}
        onBlur={save}
        placeholder="Add label…"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(111,168,179,.08)', border: '1px solid rgba(111,168,179,.35)',
          borderRadius: 'var(--r)', padding: '2px 7px', fontSize: 10,
          color: 'var(--mist)', outline: 'none', fontFamily: 'inherit', width: 160,
        }}
      />
    );
  }

  return label ? (
    <span
      onClick={startEdit}
      title="Click to edit label"
      style={{
        fontSize: 10, color: 'var(--accent-2)', cursor: 'text',
        background: 'rgba(111,168,179,.08)', border: '1px solid rgba(111,168,179,.2)',
        borderRadius: 'var(--r)', padding: '2px 7px',
      }}
    >
      {label}
    </span>
  ) : (
    <span
      onClick={startEdit}
      title="Add label"
      style={{ fontSize: 9, color: 'var(--graphite)', cursor: 'text', letterSpacing: '.06em' }}
    >
      + label
    </span>
  );
}

export function SessionsView({ lookback, provider }: Props) {
  const [project,  setProject]  = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: sessionData, isFetching } = trpc.sessions.list.useQuery({ lookback, provider });
  const sessions = sessionData?.items;
  const { data: expandedEvents } = trpc.sessions.events.useQuery(
    { sessionId: expanded!, lookback, provider },
    { enabled: !!expanded },
  );

  const windowMs    = WINDOW_MS[lookback];
  // eslint-disable-next-line react-hooks/purity
  const windowStart = Date.now() - windowMs;

  const allProjects = Array.from(
    new Set((sessions ?? []).map(s => s.project).filter((p): p is string => !!p))
  );

  const visible = project
    ? (sessions ?? []).filter(s => s.project === project)
    : (sessions ?? []);

  function barStyle(s: { startedAt: string; endedAt: string }) {
    const start   = new Date(s.startedAt).getTime();
    const end     = new Date(s.endedAt).getTime();
    const leftPct = Math.max(0, (start - windowStart) / windowMs) * 100;
    if (leftPct >= 100) return { left: '0%', width: '0%' };
    const widPct  = Math.max(0.5, (end - start) / windowMs * 100);
    return { left: `${leftPct}%`, width: `${Math.min(widPct, 100 - leftPct)}%` };
  }

  if (!sessionData && isFetching) {
    return (
      <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
      </div>
    );
  }

  return (
    <div className="page">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Project filter chips */}
      {allProjects.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['ALL', ...allProjects] as string[]).map(p => {
            const active = p === 'ALL' ? !project : project === p;
            return (
              <button
                key={p}
                onClick={() => setProject(p === 'ALL' ? undefined : p)}
                className="mono"
                style={{
                  fontSize: 10, letterSpacing: '.14em', padding: '3px 10px',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#000' : 'var(--mist)',
                  borderRadius: 'var(--r)', cursor: 'pointer',
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
      )}

      {/* Truncation notice */}
      {sessionData?.truncated && (
        <div style={{ padding: '6px 12px', background: 'rgba(201,150,107,.07)', border: '1px solid rgba(201,150,107,.2)', borderRadius: 'var(--r)', fontSize: 10, color: 'var(--accent-2)' }}>
          Showing 500 most recent sessions — narrow your lookback or filter by project to see more.
        </div>
      )}

      {/* Session rows */}
      {visible.length === 0 ? (
        <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <span style={{ fontSize: 12, color: 'var(--steel)' }}>No sessions in this window</span>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {visible.map((s, idx) => (
            <div key={s.sessionId === '(no session)' ? `no-session-${idx}` : s.sessionId}>

              {/* Session row */}
              <div
                onClick={() => setExpanded(expanded === s.sessionId ? null : s.sessionId)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr auto',
                  alignItems: 'center',
                  gap: 16,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--line)',
                  cursor: 'pointer',
                  background: expanded === s.sessionId ? 'var(--panel-2)' : 'transparent',
                }}
              >
                {/* Identity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span className="mono" style={{
                    fontSize: 10, color: 'var(--mist)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.sessionId}
                  </span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    {s.project && (
                      <span className="label" style={{ fontSize: 9 }}>{s.project}</span>
                    )}
                    {s.surface && (
                      <span className="label" style={{ fontSize: 9, color: 'var(--steel)' }}>{s.surface}</span>
                    )}
                    {s.sessionId !== '(no session)' && (
                      <LabelCell sessionId={s.sessionId} />
                    )}
                  </div>
                </div>

                {/* Gantt bar */}
                <div style={{ position: 'relative', height: 18, background: 'var(--panel-2)', borderRadius: 'var(--r)' }}>
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, borderRadius: 'var(--r)',
                    background: s.errorCount > 0 ? 'var(--bad)' : modelColor(s.models[0] ?? ''),
                    opacity: 0.75,
                    ...barStyle(s),
                  }} />
                </div>

                {/* Stats */}
                <div className="mono" style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--steel)', whiteSpace: 'nowrap', alignItems: 'center' }}>
                  <span>{s.callCount} calls</span>
                  <span style={{ color: 'var(--mist)' }}>{fmtCost(s.totalCost)}</span>
                  <span>{fmtDuration(s.durationMs)}</span>
                  {s.errorCount > 0 && (
                    <span style={{ color: 'var(--bad)' }}>{s.errorCount} err</span>
                  )}
                  {(() => {
                    const v = sessionVerdict(s);
                    return v !== 'ok' ? (
                      <span style={VERDICT_STYLE[v]}>{v.toUpperCase()}</span>
                    ) : null;
                  })()}
                  <span style={{ color: 'var(--steel)', fontSize: 9 }}>
                    {expanded === s.sessionId ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* Expanded event table */}
              {expanded === s.sessionId && (
                <div style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--line)' }}>
                  {!expandedEvents ? (
                    <div style={{ padding: '10px 24px', fontSize: 11, color: 'var(--steel)' }}>Loading…</div>
                  ) : expandedEvents.length === 0 ? (
                    <div style={{ padding: '10px 24px', fontSize: 11, color: 'var(--steel)' }}>No events found</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)' }}>
                          {['time', 'model', 'in', 'out', 'cached', 'cost', 'lat', 'status'].map(h => (
                            <th key={h} className="mono" style={{
                              padding: '5px 12px', textAlign: 'left',
                              color: 'var(--steel)', letterSpacing: '.12em', fontWeight: 400,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {expandedEvents.map(e => (
                          <tr key={e.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td className="mono" style={{ padding: '5px 12px', color: 'var(--steel)' }}>
                              {new Date(e.ts).toLocaleTimeString()}
                            </td>
                            <td className="mono" style={{ padding: '5px 12px', color: 'var(--mist)' }}>{e.model}</td>
                            <td className="mono" style={{ padding: '5px 12px', color: 'var(--steel)' }}>{e.inputTokens.toLocaleString()}</td>
                            <td className="mono" style={{ padding: '5px 12px', color: 'var(--steel)' }}>{e.outputTokens.toLocaleString()}</td>
                            <td className="mono" style={{ padding: '5px 12px', color: 'var(--steel)' }}>{e.cachedTokens.toLocaleString()}</td>
                            <td className="mono" style={{ padding: '5px 12px', color: 'var(--mist)' }}>{fmtCost(e.costUsd)}</td>
                            <td className="mono" style={{ padding: '5px 12px', color: 'var(--steel)' }}>{fmtMs(e.latencyMs)}</td>
                            <td className="mono" style={{
                              padding: '5px 12px',
                              color: e.status === 'error' ? 'var(--bad)' : 'var(--good)',
                            }}>{e.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
