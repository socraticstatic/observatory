'use client';

import { useState } from 'react';
import { fmt, fmtUsd } from '@/lib/fmt';

const PROJECTS = [
  { id: 'research_agent', cost: 14.22, sessions: 3,  turns: 84  },
  { id: 'inbox_triage',   cost: 3.84,  sessions: 8,  turns: 142 },
  { id: 'code_review',    cost: 6.10,  sessions: 2,  turns: 38  },
  { id: 'automation',     cost: 2.18,  sessions: 6,  turns: 210 },
];

// Synthetic sessions per project
function sessionsFor(projectId: string) {
  const map: Record<string, Array<{ id: string; ts: string; tokens: number }>> = {
    research_agent: [
      { id: 'ses_a1b2', ts: '2026-04-19 14:32', tokens: 48230 },
      { id: 'ses_c3d4', ts: '2026-04-18 09:11', tokens: 32810 },
      { id: 'ses_e5f6', ts: '2026-04-17 17:44', tokens: 21440 },
    ],
    inbox_triage: [
      { id: 'ses_g7h8', ts: '2026-04-19 13:05', tokens: 12880 },
      { id: 'ses_i9j0', ts: '2026-04-19 10:22', tokens: 9640  },
      { id: 'ses_k1l2', ts: '2026-04-18 16:55', tokens: 8310  },
    ],
    code_review: [
      { id: 'ses_m3n4', ts: '2026-04-19 11:30', tokens: 27400 },
      { id: 'ses_o5p6', ts: '2026-04-17 14:08', tokens: 19200 },
      { id: 'ses_q7r8', ts: '2026-04-16 08:45', tokens: 14950 },
    ],
    automation: [
      { id: 'ses_s9t0', ts: '2026-04-19 12:18', tokens: 11420 },
      { id: 'ses_u1v2', ts: '2026-04-18 20:33', tokens: 8770  },
      { id: 'ses_w3x4', ts: '2026-04-17 11:00', tokens: 7340  },
    ],
  };
  return map[projectId] ?? [];
}

// Synthetic turns per session
function turnsFor(sessionId: string) {
  return [
    { role: 'user',      tokens: 320,  content: 'Analyze the quarterly performance data and identify the top three cost drivers across all projects.' },
    { role: 'assistant', tokens: 1840, content: 'I have reviewed the data. The top cost drivers are: (1) Opus model usage in research_agent at 42% share, (2) high context depth averaging 8.3 turns before summarization, (3) uncached tool result repetition in automation pipeline...' },
    { role: 'user',      tokens: 184,  content: 'Can you give me a recommendation for reducing Opus usage without compromising research quality?' },
    { role: 'assistant', tokens: 2210, content: 'To reduce Opus share while protecting quality, consider routing initial triage steps to Sonnet and escalating only when the task requires multi-step reasoning over 6+ documents. Based on current routing rules...' },
    { role: 'user',      tokens: 96,   content: 'Draft a summary I can share with the team.' },
  ].map((t, i) => ({ ...t, id: `turn_${sessionId}_${i}` }));
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

export function EntityExplorer() {
  const [selProject, setSelProject] = useState<string | null>(null);
  const [selSession, setSelSession] = useState<string | null>(null);

  const sessions = selProject ? sessionsFor(selProject) : [];
  const turns    = selSession ? turnsFor(selSession)    : [];

  function resetAll()    { setSelProject(null); setSelSession(null); }
  function resetSession(){ setSelSession(null); }

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* header + breadcrumb */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">Entity Explorer · project &rarr; session &rarr; turn</div>
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
            {PROJECTS.map(p => (
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
            {selSession ? turns.map((t, i) => (
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
