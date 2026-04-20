'use client';

import { useState } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import { AddServiceModal } from './AddServiceModal';
import type { Lookback } from '@/lib/lookback';
import type { RegisteredService } from '@prisma/client';

interface ServicesRailProps {
  lookback: Lookback;
  providerFilter?: string;
}

const PROVIDER_META: Record<string, { label: string; col: string; initial: string; category: 'llm' | 'creative' }> = {
  // LLM providers — warm palette
  anthropic:  { label: 'Anthropic',   col: '#6FA8B3', initial: 'A', category: 'llm' },
  google:     { label: 'Google',      col: '#8BA89C', initial: 'G', category: 'llm' },
  xai:        { label: 'xAI',         col: '#B88A8A', initial: 'X', category: 'llm' },
  openai:     { label: 'OpenAI',      col: '#7CA893', initial: 'O', category: 'llm' },
  mistral:    { label: 'Mistral',     col: '#A89276', initial: 'M', category: 'llm' },
  local:      { label: 'Local',       col: '#7CA893', initial: 'L', category: 'llm' },
  unknown:    { label: 'Other',       col: '#7A7068', initial: '?', category: 'llm' },
  // Creative service providers
  leonardo:   { label: 'Leonardo',    col: '#C96442', initial: 'L', category: 'creative' },
  heygen:     { label: 'HeyGen',      col: '#C9966B', initial: 'H', category: 'creative' },
  elevenlabs: { label: 'ElevenLabs',  col: '#7CA893', initial: 'E', category: 'creative' },
  stability:  { label: 'Stability',   col: '#A89276', initial: 'S', category: 'creative' },
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function ServicesRail({ lookback, providerFilter }: ServicesRailProps) {
  const [showModal, setShowModal] = useState(false);
  const { data: liveData, refetch } = trpc.who.providerBreakdown.useQuery({ lookback });
  const { data: registered }        = trpc.services.list.useQuery();

  const liveRows  = liveData ?? [];
  const liveSet   = new Set(liveRows.map(r => r.provider));
  const total     = liveRows.reduce((s, r) => s + r.costUsd, 0);

  // Creative services that have been registered but have no live events yet
  const registeredOnly = (registered ?? [] as RegisteredService[]).filter((s: RegisteredService) => !liveSet.has(s.provider));

  const allRows = providerFilter
    ? liveRows.filter(r => r.provider === providerFilter)
    : liveRows;

  const showRegisteredOnly = !providerFilter;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 12, marginBottom: 16, overflowX: 'auto' }}>
        {allRows.map((row) => {
          const meta = PROVIDER_META[row.provider] ?? PROVIDER_META.unknown;
          const sharePct = total > 0 ? Math.round((row.costUsd / total) * 100) : 0;
          return (
            <div
              key={row.provider}
              className="card"
              style={{ width: 180, flexShrink: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 4, background: meta.col,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: 'var(--ink)', flexShrink: 0,
                }}>
                  {meta.initial}
                </div>
                <span className="dot live" />
              </div>
              <span className="label" style={{ fontSize: 9 }}>{meta.label}</span>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--mist)', lineHeight: 1 }}>
                {fmtUsd(row.costUsd)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--steel)' }}>
                {fmtTokens(row.tokens)} tok
              </div>
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--graphite)', letterSpacing: '.06em', textTransform: 'uppercase' }}>share</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--steel)' }}>{sharePct}%</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${sharePct}%`, borderRadius: 2, background: meta.col, opacity: 0.85 }} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Registered-only services (no live events yet) */}
        {showRegisteredOnly && registeredOnly.map((svc: RegisteredService) => {
          const meta = PROVIDER_META[svc.provider] ?? { label: svc.label, col: '#6A7278', initial: svc.label[0].toUpperCase(), category: svc.category as 'llm' | 'creative' };
          return (
            <div
              key={svc.provider}
              className="card"
              style={{ width: 180, flexShrink: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.6 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 4, background: meta.col,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: 'var(--ink)', flexShrink: 0,
                }}>
                  {meta.initial}
                </div>
                <span className="dot" style={{ background: 'var(--graphite)' }} />
              </div>
              <span className="label" style={{ fontSize: 9 }}>{meta.label}</span>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--mist)', lineHeight: 1 }}>
                {fmtUsd(0)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--graphite)' }}>
                {svc.category === 'creative' ? 'no ingest yet' : 'no events yet'}
              </div>
            </div>
          );
        })}

        {/* Add service card */}
        <div
          className="card"
          onClick={() => setShowModal(true)}
          style={{
            width: 180, flexShrink: 0, padding: '14px 16px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, border: '1px dashed var(--line-2)', background: 'transparent',
            cursor: 'pointer', boxShadow: 'none', minHeight: 100,
          }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 4, background: '#4A5358',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 600, color: 'var(--mist)', flexShrink: 0,
          }}>
            +
          </div>
          <span className="label" style={{ color: 'var(--graphite)', fontSize: 9 }}>Add service</span>
        </div>
      </div>

      {showModal && (
        <AddServiceModal
          onClose={() => setShowModal(false)}
          onSaved={() => { refetch(); }}
        />
      )}
    </>
  );
}
