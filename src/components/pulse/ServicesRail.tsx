'use client';

import { useState, useCallback } from 'react';
import { fmtUsd } from '@/lib/fmt';
import { trpc } from '@/lib/trpc-client';
import { AddServiceModal } from './AddServiceModal';
import type { Lookback } from '@/lib/lookback';
import type { RegisteredService } from '@prisma/client';

interface ServicesRailProps {
  lookback: Lookback;
  providerFilter?: string | null;
  onSelect?: (provider: string | null) => void;
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

export function ServicesRail({ lookback, providerFilter, onSelect }: ServicesRailProps) {
  const [showModal,  setShowModal]  = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [confirm,    setConfirm]    = useState<string | null>(null); // provider to confirm single-delete

  const { data: liveData, refetch } = trpc.who.providerBreakdown.useQuery({ lookback });
  const { data: registered }        = trpc.services.list.useQuery();

  const deleteOne  = trpc.services.delete.useMutation({ onSuccess: () => refetch() });
  const deleteMany = trpc.services.deleteMany.useMutation({
    onSuccess: () => { void refetch(); setSelected(new Set()); setSelectMode(false); },
  });

  const toggleSelect = useCallback((provider: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider); else next.add(provider);
      return next;
    });
  }, []);

  const liveRows  = liveData ?? [];
  const liveSet   = new Set(liveRows.map(r => r.provider));
  const total     = liveRows.reduce((s, r) => s + r.costUsd, 0);

  // Creative services that have been registered but have no live events yet
  const registeredOnly = (registered ?? [] as RegisteredService[]).filter((s: RegisteredService) => !liveSet.has(s.provider));

  const allRows = liveRows; // always show all cards; selection highlights one
  const showRegisteredOnly = !providerFilter;

  return (
    <>
      {/* Group-action toolbar — only when registered-only services exist */}
      {registeredOnly.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <button
            className="mbtn"
            onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }}
            style={{ fontSize: 9, letterSpacing: '.1em', padding: '3px 9px' }}
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
          {selectMode && selected.size > 0 && (
            <button
              className="mbtn"
              onClick={() => deleteMany.mutate({ providers: Array.from(selected) })}
              style={{
                fontSize: 9, letterSpacing: '.1em', padding: '3px 9px',
                color: 'var(--bad)', border: '1px solid rgba(184,107,107,.4)',
                background: 'rgba(184,107,107,.07)',
              }}
            >
              Delete {selected.size} selected
            </button>
          )}
          {selectMode && registeredOnly.length > 1 && (
            <button
              className="mbtn"
              onClick={() => setSelected(new Set(registeredOnly.map(s => s.provider)))}
              style={{ fontSize: 9, letterSpacing: '.1em', padding: '3px 9px' }}
            >
              Select all
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'row', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {/* All selector */}
        <div
          onClick={() => onSelect?.(null)}
          style={{
            flex: '0 0 auto', minWidth: 52, padding: '10px 12px',
            border: `1px solid ${!providerFilter ? 'var(--accent)' : 'var(--line-2)'}`,
            borderRadius: 'var(--r)',
            background: !providerFilter ? 'rgba(111,168,179,.1)' : 'rgba(0,0,0,.15)',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            transition: 'all 160ms',
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 600, color: !providerFilter ? 'var(--accent)' : 'var(--steel)', letterSpacing: '.08em' }}>ALL</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>{allRows.length}</span>
        </div>

        {allRows.map((row) => {
          const meta = PROVIDER_META[row.provider] ?? PROVIDER_META.unknown;
          const sharePct = total > 0 ? Math.round((row.costUsd / total) * 100) : 0;
          const isSelected = providerFilter === row.provider;
          return (
            <div
              key={row.provider}
              onClick={() => onSelect?.(isSelected ? null : row.provider)}
              style={{
                flex: '0 0 auto', minWidth: 156, padding: '10px 12px',
                border: `1px solid ${isSelected ? meta.col : 'var(--line-2)'}`,
                borderRadius: 'var(--r)',
                background: isSelected ? `${meta.col}10` : 'rgba(0,0,0,.15)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5,
                transition: 'all 160ms',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 3, background: meta.col,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: 'var(--ink)', flexShrink: 0,
                }}>
                  {meta.initial}
                </div>
                <span className="dot live" />
              </div>
              <span className="label" style={{ fontSize: 9 }}>{meta.label}</span>
              <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--mist)', lineHeight: 1 }}>
                {fmtUsd(row.costUsd)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--steel)' }}>{fmtTokens(row.tokens)} tok</div>
              <div style={{ marginTop: 2 }}>
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
          const isChecked = selected.has(svc.provider);
          return (
            <div
              key={svc.provider}
              className="card"
              onClick={selectMode ? () => toggleSelect(svc.provider) : undefined}
              style={{
                width: 180, flexShrink: 0, padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.6,
                position: 'relative',
                cursor: selectMode ? 'pointer' : 'default',
                border: selectMode && isChecked ? '1px solid rgba(184,107,107,.5)' : undefined,
                background: selectMode && isChecked ? 'rgba(184,107,107,.06)' : undefined,
              }}
            >
              {selectMode ? (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 14, height: 14, borderRadius: 3,
                  border: `1.5px solid ${isChecked ? 'var(--bad)' : 'var(--line-2)'}`,
                  background: isChecked ? 'rgba(184,107,107,.2)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isChecked && <span style={{ fontSize: 9, color: 'var(--bad)', lineHeight: 1 }}>✓</span>}
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirm(svc.provider); }}
                  title="Delete service"
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 18, height: 18, borderRadius: 3, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: 'var(--steel)',
                    opacity: 0, transition: 'opacity .12s',
                  }}
                  className="svc-delete-btn"
                >
                  ×
                </button>
              )}
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

      {/* Single-delete confirmation */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="card" style={{ padding: '22px 26px', maxWidth: 360, width: '100%' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mist)', marginBottom: 8 }}>
              Remove service?
            </div>
            <div style={{ fontSize: 11, color: 'var(--steel)', marginBottom: 18, lineHeight: 1.5 }}>
              Remove <span style={{ color: 'var(--fog)', fontWeight: 600 }}>{confirm}</span> from registered services.
              Historical event data is not deleted.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="mbtn" onClick={() => setConfirm(null)}>Cancel</button>
              <button
                className="mbtn"
                onClick={() => { deleteOne.mutate({ provider: confirm }); setConfirm(null); }}
                style={{
                  color: 'var(--bad)', border: '1px solid rgba(184,107,107,.4)',
                  background: 'rgba(184,107,107,.07)',
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
