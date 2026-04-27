'use client';

import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';
import { LOOKBACK_CONFIG } from '@/lib/lookback';

interface Props {
  lookback: Lookback;
  provider?: string;
  onNavigate?: (view: string) => void;
}

export function PulseSummaryVerdict({ lookback, provider, onNavigate }: Props) {
  const { data: burn }     = trpc.pulse.burnRate.useQuery({ provider });
  const { data: findings = [] } = trpc.insights.findings.useQuery({ lookback, provider });
  const { data: stat }     = trpc.pulse.statStrip.useQuery({ lookback, provider });

  if (!burn && findings.length === 0 && !stat) return null;

  const actCount  = findings.filter(f => f.severity === 'act').length;
  const warnCount = findings.filter(f => f.severity === 'warn').length;
  const runway    = burn?.runway ?? null;
  const todayCost = burn?.todayInferenceCost ?? burn?.todayCost ?? null;
  const cacheHit  = stat?.cacheHitPct ?? null;
  const errRate   = stat?.errorRatePct ?? 0;
  const label     = LOOKBACK_CONFIG[lookback].label;

  // Compute overall verdict
  const verdict: 'act' | 'watch' | 'ok' =
    actCount > 0 || (runway != null && runway < 5) || errRate > 10 ? 'act' :
    warnCount > 0 || (runway != null && runway < 10) || errRate > 3 ? 'watch' : 'ok';

  const verdictColor = verdict === 'act' ? 'var(--bad)' : verdict === 'watch' ? '#C9966B' : 'var(--good)';
  const verdictLabel = verdict === 'act' ? 'ACTION NEEDED' : verdict === 'watch' ? 'WATCH' : 'NOMINAL';

  // Build sentence
  const parts: string[] = [];

  if (todayCost != null) {
    parts.push(`$${todayCost.toFixed(2)} spent today`);
  }

  if (actCount > 0) {
    parts.push(`${actCount} critical finding${actCount > 1 ? 's' : ''}`);
  } else if (warnCount > 0) {
    parts.push(`${warnCount} warning${warnCount > 1 ? 's' : ''}`);
  } else {
    parts.push('no active findings');
  }

  if (cacheHit != null) {
    parts.push(`${cacheHit.toFixed(0)}% cache hit`);
  }

  if (runway != null && runway < 30) {
    parts.push(`${runway.toFixed(0)}d budget runway`);
  }

  const sentence = parts.join(' · ');

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      marginBottom: 12,
      borderRadius: 'var(--r)',
      border: `1px solid ${verdictColor}30`,
      background: verdict === 'act'
        ? 'rgba(184,107,107,.04)'
        : verdict === 'watch'
        ? 'rgba(201,150,107,.04)'
        : 'rgba(124,168,147,.04)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: verdictColor, display: 'inline-block' }} />
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: '.16em',
          color: verdictColor,
        }}>
          {verdictLabel}
        </span>
      </span>

      <span style={{ fontSize: 12, color: 'var(--fog)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sentence}
      </span>

      <span style={{ fontSize: 9, color: 'var(--graphite)', flexShrink: 0 }}>{label}</span>

      {(actCount > 0 || warnCount > 0) && (
        <button
          className="mbtn"
          onClick={() => onNavigate?.('Intel')}
          style={{ fontSize: 9, padding: '2px 8px', flexShrink: 0 }}
        >
          Intel ▸
        </button>
      )}
    </div>
  );
}
