'use client';

import { useState, useMemo } from 'react';
import { fmt, fmtMs } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const LOOKBACK_MINUTES: Record<Lookback, number> = { '1H': 60, '24H': 1440, '30D': 43200 };

const GLYPH_MAP: Record<string, string> = {
  desktop:    '◼',
  api:        '⟨⟩',
  vscode:     '{}',
  cli:        '▶_',
  mobile:     '▢',
  automation: '↻',
};

const COLOR_MAP: Record<string, string> = {
  desktop:    '#6FA8B3',
  api:        '#9BC4CC',
  vscode:     '#C9B08A',
  cli:        '#7CA893',
  mobile:     '#B89FC9',
  automation: '#B88A8A',
};

const LAT_CHAR_MAP: Record<string, string> = {
  desktop:    'interactive',
  api:        'scripted',
  vscode:     'inline',
  cli:        'pipeline',
  mobile:     'bursty',
  automation: 'zombie-prone',
};

interface Props {
  lookback?: Lookback;
  provider?: string;
}

export function AppSurfaceCard({ lookback = '24H', provider }: Props) {
  const { data: raw } = trpc.surface.appSurface.useQuery({ lookback, provider });
  const [hover, setHover] = useState<string | null>(null);

  const minutes = LOOKBACK_MINUTES[lookback];

  const enriched = useMemo(() => {
    if (!raw) return [];
    return raw.map(s => ({
      ...s,
      glyph:   GLYPH_MAP[s.id]    ?? '○',
      color:   COLOR_MAP[s.id]    ?? '#8A9297',
      latChar: LAT_CHAR_MAP[s.id] ?? '—',
      flag:    s.id === 'automation',
      tpm:     minutes > 0 ? s.calls / minutes : 0,
    }));
  }, [raw, minutes]);

  if (!raw) {
    return (
      <div className="card" style={{ padding: '14px 16px', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
      </div>
    );
  }

  const maxTpm = enriched.length > 0 ? Math.max(...enriched.map(s => s.tpm)) : 1;
  const highestVelocity = enriched.reduce((a, b) => (a.tpm > b.tpm ? a : b), enriched[0]);
  const watchSurface = enriched.find(s => s.flag) ?? enriched.reduce((a, b) => (a.sessions > b.sessions ? a : b), enriched[0]);

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div className="label">WHERE · APP SURFACE</div>
          <div style={{ fontSize: 13, color: 'var(--fog)', marginTop: 3 }}>
            which client the request came <em style={{ color: 'var(--mist)', fontStyle: 'normal' }}>from</em>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="chip" style={{ borderColor: 'rgba(111,168,179,.4)', color: 'var(--accent-2)' }}>
            <span className="dot live" /> {enriched.length} surfaces
          </span>
        </div>
      </div>

      {/* share bar */}
      <div style={{ height: 20, display: 'flex', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--line-2)', marginBottom: 12 }}>
        {enriched.map(s => (
          <div
            key={s.id}
            onMouseEnter={() => setHover(s.id)}
            onMouseLeave={() => setHover(null)}
            style={{
              width: (s.sharePct) + '%',
              background: s.color,
              opacity: hover && hover !== s.id ? 0.35 : 1,
              transition: 'opacity 120ms',
              cursor: 'pointer',
            }}
            title={s.label + ' ' + Math.round(s.sharePct) + '%'}
          />
        ))}
      </div>

      {/* rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {enriched.map(s => (
          <div
            key={s.id}
            onMouseEnter={() => setHover(s.id)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 140px 1fr 72px 60px 64px',
              gap: 10,
              alignItems: 'center',
              padding: '8px 0',
              borderTop: '1px solid var(--line)',
              background: hover === s.id ? 'rgba(111,168,179,.04)' : 'transparent',
              transition: 'background 120ms',
              cursor: 'pointer',
            }}
          >
            <span className="mono" style={{ fontSize: 14, color: s.color, textAlign: 'center' }}>{s.glyph}</span>
            <div>
              <div style={{ fontSize: 12, color: 'var(--mist)' }}>{s.label}</div>
              <div className="mono" style={{ fontSize: 9, color: s.flag ? '#C9966B' : 'var(--graphite)', letterSpacing: '.1em' }}>
                {s.latChar}{s.flag && ' ⚠'}
              </div>
            </div>
            {/* tpm bar */}
            <div style={{ position: 'relative', height: 10, background: 'rgba(255,255,255,.02)', borderRadius: 2 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (maxTpm > 0 ? s.tpm / maxTpm * 100 : 0) + '%', background: s.color, opacity: 0.75 }} />
              <span className="mono" style={{ position: 'absolute', right: 4, top: -1, fontSize: 9, color: 'var(--fog)', lineHeight: '12px' }}>{fmt(s.tpm)} tpm</span>
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fog)', textAlign: 'right' }}>{fmtMs(s.p50LatMs)}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--graphite)', textAlign: 'right' }}>{s.sessions} sess</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--mist)', textAlign: 'right', fontWeight: 600 }}>${s.costUsd.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* footer tiles */}
      {enriched.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, padding: '8px 10px', background: 'rgba(0,0,0,.2)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
            <div className="label" style={{ fontSize: 9 }}>HIGHEST VELOCITY</div>
            <div style={{ fontSize: 11, color: 'var(--mist)', marginTop: 2 }}>
              {highestVelocity.label}{' '}
              <span className="mono" style={{ color: 'var(--steel)' }}>· {fmt(highestVelocity.tpm)} tpm</span>
            </div>
          </div>
          {watchSurface && (
            <div style={{ flex: 1, padding: '8px 10px', background: 'rgba(201,150,107,.06)', border: '1px solid rgba(201,150,107,.3)', borderRadius: 'var(--r)' }}>
              <div className="label" style={{ fontSize: 9, color: '#C9966B' }}>SURFACE TO WATCH</div>
              <div style={{ fontSize: 11, color: 'var(--mist)', marginTop: 2 }}>
                {watchSurface.label}{' '}
                <span className="mono" style={{ color: 'var(--steel)' }}>· {watchSurface.sessions} sess, ${watchSurface.costUsd.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
