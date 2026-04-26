'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';

interface Zombie {
  id: string;
  type: string;
  steps: number;
  rate: string;
  proj: string;
  costUsd: number;
  severity: 'bad' | 'warn' | 'info';
}


function severityFor(bloatRatio: number, type: string): 'bad' | 'warn' | 'info' {
  if (type === 'Abandoned' || type === 'abandoned') return 'info';
  if (bloatRatio > 2) return 'bad';
  if (bloatRatio > 1) return 'warn';
  return 'info';
}

function fmtRate(costUsd: number, ageMs: number): string {
  if (ageMs <= 0) return '0 tok/min';
  const tokPerMin = (costUsd * 1000000 / 10) / (ageMs / 60000);
  if (tokPerMin > 1000) return `${(tokPerMin / 1000).toFixed(1)}K tok/min`;
  return `${Math.round(tokPerMin)} tok/min`;
}

const SEV_COLOR = {
  bad:  '#B86B6B',
  warn: '#C9966B',
  info: '#87867F',
} as const;

type Severity = 'bad' | 'warn' | 'info';

function ActionButton({ severity, action, onClick }: { severity: Severity; action: 'Kill' | 'Review'; onClick: () => void }) {
  const isKill = action === 'Kill';
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 'var(--r)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        border: '1px solid',
        cursor: 'pointer',
        transition: 'all .12s',
        borderColor: isKill ? 'rgba(184,107,107,.4)' : 'rgba(201,150,107,.35)',
        color: isKill ? '#B86B6B' : '#C9966B',
        background: isKill ? 'rgba(184,107,107,.07)' : 'rgba(201,150,107,.07)',
      }}
      onMouseEnter={e => {
        const t = e.currentTarget;
        t.style.background = isKill ? 'rgba(184,107,107,.15)' : 'rgba(201,150,107,.15)';
      }}
      onMouseLeave={e => {
        const t = e.currentTarget;
        t.style.background = isKill ? 'rgba(184,107,107,.07)' : 'rgba(201,150,107,.07)';
      }}
    >
      {action}
    </button>
  );
}

interface ZombieSessionsCardProps {
  onReview?: (sessionId: string) => void;
  provider?: string;
}

export function ZombieSessionsCard({ onReview, provider }: ZombieSessionsCardProps) {
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [killedSessions, setKilledSessions] = useState<Set<string>>(new Set());
  const { data: zombieData, refetch } = trpc.insights.zombieSessions.useQuery({ provider });
  const killMutation = trpc.insights.killSession.useMutation({
    onSuccess: (_data, variables) => {
      setKilledSessions(prev => new Set([...prev, variables.sessionId]));
      void refetch();
    },
  });

  const ZOMBIES = useMemo<readonly Zombie[]>(() => {
    if (!zombieData || zombieData.length === 0) return [];
    return zombieData.map(z => ({
      id: z.sessionId,
      type: z.type.charAt(0).toUpperCase() + z.type.slice(1),
      steps: z.steps,
      rate: fmtRate(z.costUsd, z.ageMs),
      proj: `$${z.costUsd.toFixed(2)}`,
      costUsd: z.costUsd,
      severity: severityFor(z.bloatRatio, z.type),
    }));
  }, [zombieData]);

  const handleKill = (id: string) => {
    killMutation.mutate({ sessionId: id });
  };

  const handleReview = (id: string) => {
    setReviewed(prev => new Set([...prev, id]));
    onReview?.(id);
  };

  const active = ZOMBIES.filter(z => !killedSessions.has(z.id));
  const killedCount = killedSessions.size;

  if (!zombieData) return (
    <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
      <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
    </div>
  );

  if (ZOMBIES.length === 0) return (
    <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--good)' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fog)' }}>No zombie sessions</span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--graphite)', textAlign: 'center', maxWidth: 340 }}>
        All sessions are within normal bounds. Loops, bloat, and runaway costs appear here when detected.
      </span>
    </div>
  );

  return (
    <div className="card">
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--mist)' }}>Zombie Sessions</span>
        <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>Runaway costs at risk</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {killedCount > 0 && (
            <span style={{ fontSize: 10, color: 'var(--good)' }}>{killedCount} killed</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#B86B6B' }} />
            <span style={{ fontSize: 9, color: 'var(--steel)' }}>{ZOMBIES.filter(z => z.severity === 'bad').length} critical</span>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Type</th>
            <th>Steps</th>
            <th>Token Rate</th>
            <th>Projected 24h</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {active.map((z) => {
            const color = SEV_COLOR[z.severity as Severity];
            const isReviewed = reviewed.has(z.id);
            const needsKill = z.severity === 'bad';
            const isCritical = z.severity === 'bad';

            return (
              <tr
                key={z.id}
                style={{
                  opacity: isReviewed ? 0.6 : 1,
                  transition: 'opacity .15s',
                }}
              >
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isCritical && (
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: color,
                        boxShadow: `0 0 0 3px ${color}22`,
                        flexShrink: 0,
                        animation: 'pulse 1.6s ease-in-out infinite',
                      }} />
                    )}
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: 'var(--fog)',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                      }}
                      title={z.id}
                    >
                      {z.id}
                    </span>
                  </div>
                </td>
                <td>
                  <span style={{
                    display: 'inline-flex',
                    padding: '2px 7px',
                    borderRadius: 'var(--r)',
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color,
                    background: `${color}15`,
                    border: `1px solid ${color}30`,
                  }}>
                    {z.type}
                  </span>
                </td>
                <td className="mono" style={{ fontSize: 11, color: isCritical ? 'var(--warn)' : 'var(--fog)' }}>
                  {z.steps}
                </td>
                <td className="mono" style={{ fontSize: 11, color: z.rate === '0 tok/min' ? 'var(--graphite)' : isCritical ? '#B86B6B' : 'var(--fog)' }}>
                  {z.rate}
                </td>
                <td className="mono" style={{
                  fontSize: 12,
                  fontWeight: z.proj !== '$0' ? 600 : 400,
                  color: z.proj !== '$0' ? color : 'var(--graphite)',
                }}>
                  {z.proj}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {needsKill ? (
                      <ActionButton severity="bad" action="Kill" onClick={() => handleKill(z.id)} />
                    ) : (
                      <ActionButton severity="warn" action="Review" onClick={() => handleReview(z.id)} />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {active.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--good)', fontSize: 12, padding: '20px 0' }}>
                All zombie sessions terminated
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Footer: projected total */}
      <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 24, alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'var(--steel)' }}>
          Total at risk:
          <span className="mono" style={{ color: '#B86B6B', fontWeight: 600, marginLeft: 6 }}>
            ${active.reduce((s, z) => s + z.costUsd, 0).toFixed(2)}
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--steel)', marginLeft: 'auto' }}>
          {active.filter(z => z.severity === 'bad').length > 0
            ? <span style={{ color: 'var(--warn)' }}>
                {active.filter(z => z.severity === 'bad').length} sessions require immediate action
              </span>
            : <span style={{ color: 'var(--good)' }}>No critical sessions</span>
          }
        </div>
      </div>
    </div>
  );
}
