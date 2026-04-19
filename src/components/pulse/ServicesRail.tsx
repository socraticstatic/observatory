'use client';

import { fmtUsd } from '@/lib/fmt';

interface Service {
  id: string;
  label: string;
  col: string;
  cost: number | null;
  tokens: string | null;
  share: number;
  status: 'live' | 'add';
}

const SERVICES: Service[] = [
  { id: 'anthropic', label: 'Anthropic', col: '#9BC4CC', cost: 18.48, tokens: '43.2M', share: 0.68, status: 'live' },
  { id: 'google',    label: 'Google',    col: '#C9B08A', cost:  2.18, tokens: '12.1M', share: 0.18, status: 'live' },
  { id: 'xai',       label: 'xAI',       col: '#B88A8A', cost:  1.06, tokens:  '5.8M', share: 0.09, status: 'live' },
  { id: 'local',     label: 'Local',     col: '#7CA893', cost:  0.00, tokens:  '1.9M', share: 0.03, status: 'live' },
  { id: 'add',       label: '+',         col: '#4A5358', cost: null,  tokens: null,    share: 0,    status: 'add'  },
];

export function ServicesRail() {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 12, marginBottom: 16, overflowX: 'auto' }}>
      {SERVICES.map((svc) => {
        if (svc.status === 'add') {
          return (
            <div
              key={svc.id}
              className="card"
              style={{
                width: 180,
                flexShrink: 0,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: '1px dashed var(--line-2)',
                background: 'transparent',
                cursor: 'pointer',
                boxShadow: 'none',
                minHeight: 100,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: svc.col,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--mist)',
                  flexShrink: 0,
                }}
              >
                +
              </div>
              <span className="label" style={{ color: 'var(--graphite)', fontSize: 9 }}>Add service</span>
            </div>
          );
        }

        const sharePct = Math.round(svc.share * 100);

        return (
          <div
            key={svc.id}
            className="card"
            style={{
              width: 180,
              flexShrink: 0,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {/* Badge + live dot row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: svc.col,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  flexShrink: 0,
                }}
              >
                {svc.label[0]}
              </div>
              <span className="dot live" />
            </div>

            {/* Provider label */}
            <span className="label" style={{ fontSize: 9 }}>{svc.label}</span>

            {/* Cost */}
            <div
              className="mono"
              style={{ fontSize: 18, fontWeight: 600, color: 'var(--mist)', lineHeight: 1 }}
            >
              {svc.cost !== null ? fmtUsd(svc.cost) : '--'}
            </div>

            {/* Tokens */}
            {svc.tokens && (
              <div style={{ fontSize: 10, color: 'var(--steel)' }}>
                {svc.tokens} tok
              </div>
            )}

            {/* Share bar */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--graphite)', fontFamily: 'inherit', letterSpacing: '.06em', textTransform: 'uppercase' }}>share</span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--steel)' }}>{sharePct}%</span>
              </div>
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: 'var(--line)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${sharePct}%`,
                    borderRadius: 2,
                    background: svc.col,
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
