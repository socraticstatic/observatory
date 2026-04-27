'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc-client';
import { fmt, fmtUsd, fmtMs } from '@/lib/fmt';
import { fmtUnits } from '@/lib/service-registry';
import type { Lookback } from '@/lib/lookback';
import { ViewStatusBar } from '@/components/shared/ViewStatusBar';

interface Props {
  lookback: Lookback;
  provider?: string;
}

const PROVIDER_META: Record<string, { label: string; dot: string }> = {
  anthropic:  { label: 'Claude',     dot: '#6FA8B3' },
  google:     { label: 'Gemini',     dot: '#8BA89C' },
  xai:        { label: 'Grok',       dot: '#B88A8A' },
  meta:       { label: 'Llama',      dot: '#9BA87C' },
  ollama:     { label: 'Ollama',     dot: '#A89276' },
  openai:     { label: 'OpenAI',     dot: '#7CA893' },
};

const CREATIVE_PROVIDERS = new Set(['heygen', 'elevenlabs', 'leonardo', 'fal', 'replicate', 'stability']);

const STATUS_OPTS: { id: 'ok' | 'error' | undefined; label: string }[] = [
  { id: undefined, label: 'All' },
  { id: 'ok',      label: 'OK' },
  { id: 'error',   label: 'Error' },
];

function providerDot(p: string): string {
  return PROVIDER_META[p]?.dot ?? '#7A7068';
}


type TraceItem = {
  id: string;
  ts: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costUsd: number;
  latencyMs: number | null;
  status: string;
  sessionId: string | null;
  project: string | null;
  surface: string | null;
  contentType: string | null;
  billingUnit: string;
  rawPayload: unknown;
};

export function TracesView({ lookback, provider: externalProvider }: Props) {
  const [provider, setProvider] = useState<string | undefined>(externalProvider);
  const [status,   setStatus]   = useState<'ok' | 'error' | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cursor,   setCursor]   = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<TraceItem[]>([]);

  useEffect(() => {
    setProvider(externalProvider);
    setCursor(undefined);
    setAllItems([]);
  }, [externalProvider]);

  const { data, isFetching } = trpc.traces.list.useQuery(
    { lookback, provider, status, cursor, limit: 50 },
  );
  const { data: providerData } = trpc.who.providerBreakdown.useQuery({ lookback });

  const providerOptions = [
    { id: undefined as string | undefined, label: 'All' },
    ...(providerData ?? [])
      .filter(p => !CREATIVE_PROVIDERS.has(p.provider))
      .map(p => ({
        id: p.provider,
        label: PROVIDER_META[p.provider]?.label ?? p.provider,
      })),
  ];

  // Pagination accumulator — intentional direct setState, not a cascade risk
  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!cursor) { setAllItems(data.items); }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else { setAllItems(prev => [...prev, ...data.items]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cursor]);

  function applyProvider(p: string | undefined) {
    setProvider(p);
    setCursor(undefined);
    setAllItems([]);
  }

  function applyStatus(s: 'ok' | 'error' | undefined) {
    setStatus(s);
    setCursor(undefined);
    setAllItems([]);
  }

  function loadMore() {
    if (data?.nextCursor) setCursor(data.nextCursor);
  }

  const items = allItems.length > 0 ? allItems : (data?.items ?? []);

  const COL = '140px 1fr 120px 100px 72px 72px 60px 32px';

  return (
    <div className="page">
      <ViewStatusBar lookback={lookback} provider={provider} />
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="label">Provider</span>
        <div className="seg">
          {providerOptions.map(p => (
            <button
              key={String(p.id)}
              className={provider === p.id ? 'on' : ''}
              onClick={() => applyProvider(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="label" style={{ marginLeft: 8 }}>Status</span>
        <div className="seg">
          {STATUS_OPTS.map(s => (
            <button
              key={String(s.id)}
              className={status === s.id ? 'on' : ''}
              onClick={() => applyStatus(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--steel)' }}>
          {items.length} events
          {isFetching && <span style={{ marginLeft: 8, color: 'var(--graphite)' }}>loading…</span>}
        </span>
        <a
          href={`/api/export?lookback=${lookback}${provider ? `&provider=${provider}` : ''}`}
          download
          style={{
            padding: '3px 10px', borderRadius: 'var(--r)', fontSize: 9, fontWeight: 600,
            letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none',
            border: '1px solid var(--line-2)', color: 'var(--steel)',
            background: 'transparent', cursor: 'pointer',
          }}
        >
          ↓ CSV
        </a>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '8px 16px', borderBottom: '1px solid var(--line)', gap: 8 }}>
          {['Time', 'Model', 'Provider', 'Units', 'Cost', 'Latency', 'Status', ''].map(h => (
            <span key={h} className="label" style={{ fontSize: 9 }}>{h}</span>
          ))}
        </div>

        {/* Empty state */}
        {items.length === 0 && !isFetching && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 12 }}>
            No events in this window
          </div>
        )}

        {/* Rows */}
        {items.map(row => (
          <div key={row.id}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: COL,
                padding: '8px 16px',
                gap: 8,
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
                background: expanded === row.id ? 'rgba(111,168,179,.04)' : 'transparent',
              }}
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
            >
              <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>
                {new Date(row.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fog)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.model}
              </span>
              <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: providerDot(row.provider), flexShrink: 0 }} />
                <span style={{ color: 'var(--steel)' }}>{row.provider}</span>
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
                {row.billingUnit === 'tokens'
                  ? <>{fmt(row.inputTokens + row.outputTokens)}{row.cachedTokens > 0 && <span style={{ color: 'var(--accent-2)', marginLeft: 4 }}>+{fmt(row.cachedTokens)}c</span>}</>
                  : fmtUnits(row.inputTokens, row.provider)
                }
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
                {fmtUsd(row.costUsd)}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
                {(row.latencyMs ?? 0) > 0
                  ? fmtMs(row.latencyMs)
                  : row.cachedTokens > 0
                  ? <span style={{ fontSize: 9, color: 'var(--accent-2)', letterSpacing: '.08em' }}>cache</span>
                  : '—'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: row.status === 'error' ? 'var(--bad)' : 'var(--good)' }}>
                {row.status.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: 'var(--graphite)', textAlign: 'right' }}>
                {expanded === row.id ? '▲' : '▼'}
              </span>
            </div>

            {/* Expanded detail */}
            {expanded === row.id && (
              <div style={{ padding: '12px 16px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(11,16,20,.4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 16px', marginBottom: 12 }}>
                  {[
                    { label: 'Session',          val: row.sessionId    ?? '—' },
                    { label: 'Project',           val: row.project      ?? '—' },
                    { label: 'Surface',           val: row.surface      ?? '—' },
                    { label: 'Content type',      val: row.contentType  ?? '—' },
                    { label: row.billingUnit === 'tokens' ? 'Input tokens'  : `Input (${row.billingUnit})`, val: fmt(row.inputTokens) },
                    { label: row.billingUnit === 'tokens' ? 'Output tokens' : 'Output units',              val: fmt(row.outputTokens) },
                    { label: 'Cached tokens',     val: fmt(row.cachedTokens) },
                    { label: 'Reasoning tokens',  val: fmt(row.reasoningTokens) },
                  ].map(({ label, val }) => (
                    <div key={label}>
                      <div className="label" style={{ marginBottom: 2 }}>{label}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--fog)', wordBreak: 'break-all' }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div className="label" style={{ marginBottom: 6 }}>Raw payload</div>
                <pre style={{
                  margin: 0,
                  padding: '8px 10px',
                  background: 'rgba(0,0,0,.3)',
                  borderRadius: 'var(--r)',
                  fontSize: 10,
                  color: 'var(--steel)',
                  overflow: 'auto',
                  maxHeight: 240,
                  lineHeight: 1.5,
                }}>
                  {JSON.stringify(row.rawPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}

        {/* Load more */}
        {data?.nextCursor && (
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--line)' }}>
            <button className="mbtn" onClick={loadMore} disabled={isFetching} style={{ opacity: isFetching ? 0.5 : 1 }}>
              {isFetching ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
