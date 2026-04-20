'use client';

import { useState } from 'react';
import { fmt, fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

interface Project {
  id: string;
  cost: number;
  sessions: number;
  turns: number;
}

interface Session {
  id: string;
  ts: string;
  tokens: number;
}

interface Turn {
  id: string;
  role: string;
  tokens: number;
  content: string;
}


const COL = { width: '33.33%', minWidth: 0, display: 'flex', flexDirection: 'column' as const, borderRight: '1px solid var(--line)', overflow: 'hidden' };
const COL_LAST = { ...COL, borderRight: 'none' };

function ColHeader({ label }: { label: string }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', background: 'rgba(255,255,255,.01)' }}>
      <span className="label">{label}</span>
    </div>
  );
}

interface Props {
  lookback?: Lookback;
}

export function EntityExplorer({ lookback = '24H' }: Props) {
  const [selProject, setSelProject] = useState<string | null>(null);
  const [selSession, setSelSession] = useState<string | null>(null);

  const { data: projectData } = trpc.entity.projects.useQuery({ lookback });
  const { data: sessionData } = trpc.entity.sessions.useQuery(
    { project: selProject ?? '', lookback },
    { enabled: !!selProject }
  );
  const { data: turnData } = trpc.entity.turns.useQuery(
    { sessionId: selSession ?? '' },
    { enabled: !!selSession }
  );

  const projects: Project[] = projectData
    ? projectData.map(p => ({
        id: p.project,
        cost: p.costUsd,
        sessions: p.sessions,
        turns: p.calls,
      }))
    : [];

  const sessions: Session[] = selProject
    ? (sessionData ?? []).map(s => ({
        id: s.sessionId,
        ts: new Date(s.lastTs).toISOString().slice(0, 16).replace('T', ' '),
        tokens: s.calls,
      }))
    : [];

  const turns: Turn[] = selSession
    ? (turnData ?? []).map(t => ({
        id: t.id,
        role: t.turn % 2 === 1 ? 'user' : 'assistant',
        tokens: t.inputTokens + t.outputTokens,
        content: `${t.model} · ${t.status} · ${t.latencyMs}ms`,
      }))
    : [];

  function resetAll()    { setSelProject(null); setSelSession(null); }
  function resetSession(){ setSelSession(null); }

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* header + breadcrumb */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">Entity Explorer &middot; project &rarr; session &rarr; turn</div>
        <div style={{ fontSize: 11, color: 'var(--steel)', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span
            style={{ cursor: 'pointer', color: selProject ? 'var(--accent)' : 'var(--fog)' }}
            onClick={resetAll}
          >
            all
          </span>
          {selProject && (
            <>
              <span style={{ color: 'var(--graphite)' }}>/</span>
              <span
                style={{ cursor: 'pointer', color: selSession ? 'var(--accent)' : 'var(--fog)' }}
                onClick={resetSession}
              >
                {selProject}
              </span>
            </>
          )}
          {selSession && (
            <>
              <span style={{ color: 'var(--graphite)' }}>/</span>
              <span style={{ color: 'var(--fog)' }}>{selSession}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', height: 340, overflow: 'hidden' }}>
        {/* Column 1: Projects */}
        <div style={COL}>
          <ColHeader label="Projects" />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {projects.length === 0 && (
              <div style={{ padding: '20px 12px', fontSize: 11, color: 'var(--graphite)', textAlign: 'center' }}>
                {projectData ? 'No projects yet' : 'Loading…'}
              </div>
            )}
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => { setSelProject(p.id); setSelSession(null); }}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--line)',
                  background: selProject === p.id ? 'rgba(111,168,179,.07)' : 'transparent',
                  boxShadow: selProject === p.id ? 'inset 2px 0 0 var(--accent)' : 'none',
                  transition: 'background 0.12s',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 4 }}>{p.id}</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--warn)' }}>{fmtUsd(p.cost)}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{p.sessions} sess</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{p.turns} turns</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Sessions */}
        <div style={COL}>
          <ColHeader label={selProject ? `Sessions — ${selProject}` : 'Sessions'} />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {selProject ? sessions.map(s => (
              <div
                key={s.id}
                onClick={() => setSelSession(s.id)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--line)',
                  background: selSession === s.id ? 'rgba(111,168,179,.07)' : 'transparent',
                  boxShadow: selSession === s.id ? 'inset 2px 0 0 var(--accent)' : 'none',
                  transition: 'background 0.12s',
                }}
              >
                <div className="mono" style={{ fontSize: 11, color: 'var(--mist)', marginBottom: 3 }}>{s.id}</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>{s.ts}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--accent)' }}>{fmt(s.tokens)} tok</span>
                </div>
              </div>
            )) : (
              <div style={{ padding: '20px 12px', fontSize: 11, color: 'var(--graphite)' }}>Select a project</div>
            )}
          </div>
        </div>

        {/* Column 3: Turns */}
        <div style={COL_LAST}>
          <ColHeader label={selSession ? `Turns — ${selSession}` : 'Turns'} />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {selSession ? turns.map((t) => (
              <div key={t.id} style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--line)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: t.role === 'user' ? 'var(--accent)' : 'var(--warn)',
                    fontWeight: 600,
                  }}>
                    {t.role}
                  </span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>
                    {t.tokens} tok
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--fog)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.content}
                </div>
              </div>
            )) : (
              <div style={{ padding: '20px 12px', fontSize: 11, color: 'var(--graphite)' }}>Select a session</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
