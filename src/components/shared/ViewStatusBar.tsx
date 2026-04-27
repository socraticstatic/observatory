'use client';

import { trpc } from '@/lib/trpc-client';

function fmtAgo(secs: number): string {
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}

interface Props {
  lookback?: string;
  provider?: string;
}

export function ViewStatusBar({ lookback, provider }: Props) {
  const { data: health } = trpc.health.status.useQuery(undefined, { refetchInterval: 30_000 });

  if (!health) return null;

  const statusColor = health.status === 'ok' ? 'var(--good)' : health.status === 'idle' ? '#C9966B' : 'var(--bad)';
  const statusLabel = health.status === 'ok' ? 'LIVE' : health.status === 'idle' ? 'IDLE' : 'STALE';
  const ago = health.secondsAgo != null ? fmtAgo(health.secondsAgo) : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 0 10px',
      borderBottom: '1px solid var(--line)',
      marginBottom: 12,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: statusColor }}>{statusLabel}</span>
      </span>
      {ago && (
        <span style={{ fontSize: 9, color: 'var(--graphite)' }}>last ingest {ago}</span>
      )}
      {health.dataRange.oldest && (
        <span style={{ fontSize: 9, color: 'var(--graphite)' }}>
          data from {health.dataRange.oldest.slice(0, 10)}
        </span>
      )}
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      {lookback && (
        <span style={{ fontSize: 9, color: 'var(--graphite)', letterSpacing: '.1em' }}>{lookback}</span>
      )}
      {provider && (
        <span style={{ fontSize: 9, color: 'var(--accent-2)', letterSpacing: '.1em', textTransform: 'uppercase' }}>{provider}</span>
      )}
    </div>
  );
}
