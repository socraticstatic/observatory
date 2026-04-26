'use client';

import { useState, useEffect, useCallback } from 'react';

interface Props {
  onClose: () => void;
}

type Provider = 'all' | 'anthropic' | 'google' | 'xai';

interface StreamEvent {
  id: string;
  ts: string;
  provider: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  latencyMs: number | null;
  status: string | null;
  surface: string | null;
  rawPayload: unknown;
}

function deriveType(e: StreamEvent): string {
  if (e.status === 'error') return 'error';
  if (e.cachedTokens > 0)   return 'cache_hit';
  return 'inference';
}

function deriveLabel(e: StreamEvent): string {
  const model = e.model ?? 'unknown';
  const out   = e.outputTokens.toLocaleString();
  const type  = deriveType(e);
  if (type === 'cache_hit') return `${model} · ${e.cachedTokens.toLocaleString()} tok cached`;
  if (type === 'error')     return `${model} · error`;
  return `${model} · ${out} tok out`;
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#6FA8B3',
  google:    '#8BA89C',
  xai:       '#B88A8A',
};

const TYPE_COLORS: Record<string, string> = {
  inference: 'var(--accent)',
  cache_hit: '#7CA893',
  error:     '#B86B6B',
};

function highlight(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span style="color:#9BC4CC">"$1"</span>:')
    .replace(/:\s*"([^"]*)"/g, ': <span style="color:#C9B08A">"$1"</span>')
    .replace(/:\s*(-?\d+\.?\d*)/g, ': <span style="color:#7CA893">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span style="color:#B89FC9">$1</span>');
}

function highlightTokenFields(html: string): string {
  return html.replace(
    /("(inputTokens|outputTokens|cachedTokens|cacheCreationTokens|reasoningTokens|input_tokens|output_tokens|cache_read_input_tokens|cache_creation_input_tokens|thinking_tokens)"<\/span>:\s*<span style="color:#7CA893">)(\d+)(<\/span>)/g,
    '$1<span style="background:rgba(201,150,107,.18);border-radius:2px;padding:0 2px">$3</span>$4'
  );
}

export function SystemLogOverlay({ onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>('all');
  const [paused, setPaused] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>([]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  useEffect(() => {
    if (paused) return;
    const url = `/api/stream${provider !== 'all' ? `?provider=${provider}` : ''}`;
    let evtSource: EventSource | null = null;
    try {
      evtSource = new EventSource(url);
      evtSource.onmessage = (e) => {
        try {
          const event: StreamEvent = JSON.parse(e.data);
          setEvents(prev => {
            if (prev.some(p => p.id === event.id)) return prev;
            return [event, ...prev].slice(0, 512);
          });
        } catch {
          // ignore malformed events
        }
      };
      evtSource.onerror = () => {
        evtSource?.close();
      };
    } catch {
      // no EventSource support
    }
    return () => { evtSource?.close(); };
  }, [paused, provider]);

  const filteredEvents = provider === 'all'
    ? events
    : events.filter(e => e.provider === provider);

  const selectedEvent = filteredEvents.find(e => e.id === selected) ?? filteredEvents[0] ?? null;

  const prettyJson = selectedEvent
    ? JSON.stringify({
        id: selectedEvent.id,
        model: selectedEvent.model,
        provider: selectedEvent.provider,
        surface: selectedEvent.surface,
        status: selectedEvent.status,
        inputTokens: selectedEvent.inputTokens,
        outputTokens: selectedEvent.outputTokens,
        cachedTokens: selectedEvent.cachedTokens,
        cacheCreationTokens: selectedEvent.cacheCreationTokens,
        reasoningTokens: selectedEvent.reasoningTokens,
        costUsd: selectedEvent.costUsd,
        latencyMs: selectedEvent.latencyMs,
        rawPayload: selectedEvent.rawPayload,
      }, null, 2)
    : '{}';
  const highlighted = highlightTokenFields(highlight(prettyJson));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backdropFilter: 'blur(8px)',
        background: 'rgba(11,16,20,.88)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        margin: 'auto',
        width: 'min(960px, calc(100vw - 40px))',
        height: 'min(700px, calc(100vh - 80px))',
        background: 'linear-gradient(180deg, #1A2125 0%, #141A1E 100%)',
        border: '1px solid var(--line-2)',
        borderRadius: 6,
        boxShadow: '0 40px 80px rgba(0,0,0,.8)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: paused ? 'var(--steel)' : 'var(--good)',
              boxShadow: paused ? 'none' : '0 0 0 3px rgba(124,168,147,.18)',
              animation: paused ? 'none' : 'pulse 1.6s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mist)', letterSpacing: '.04em' }}>
              System Log
            </span>
            <span style={{ fontSize: 10, color: 'var(--steel)' }}>
              {paused ? 'Paused' : events.length === 0 ? 'Connecting…' : 'Streaming'}
            </span>
          </div>

          <div className="seg" style={{ marginLeft: 8 }}>
            {(['all', 'anthropic', 'google', 'xai'] as Provider[]).map(p => (
              <button
                key={p}
                className={provider === p ? 'on' : ''}
                onClick={() => setProvider(p)}
                style={{ ...(provider === p && p !== 'all' ? { color: PROVIDER_COLORS[p] } : {}) }}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="mbtn" onClick={() => setPaused(v => !v)}>
              {paused ? (
                <><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polygon points="2,1 9,5 2,9" fill="currentColor" /></svg>Resume</>
              ) : (
                <><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="3" height="8" fill="currentColor" rx="1" /><rect x="6" y="1" width="3" height="8" fill="currentColor" rx="1" /></svg>Pause</>
              )}
            </button>
            <button className="mbtn" onClick={onClose} aria-label="Close overlay">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" />
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              ESC
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', flex: 1, overflow: 'hidden' }}>
          {/* Left: event list */}
          <div style={{ borderRight: '1px solid var(--line)', overflow: 'auto' }}>
            {filteredEvents.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--graphite)', fontSize: 11 }}>
                {paused ? 'Paused. Resume to stream events.' : 'Waiting for events…'}
              </div>
            )}
            {filteredEvents.map((ev) => {
              const isSel   = ev.id === (selected ?? filteredEvents[0]?.id);
              const pColor  = PROVIDER_COLORS[ev.provider] ?? 'var(--steel)';
              const type    = deriveType(ev);
              const tColor  = TYPE_COLORS[type] ?? 'var(--steel)';
              const label   = deriveLabel(ev);
              const time    = new Date(ev.ts).toISOString().slice(11, 23);

              return (
                <div
                  key={ev.id}
                  onClick={() => setSelected(ev.id)}
                  className={isSel ? 'selected' : ''}
                  style={{
                    padding: '9px 14px',
                    borderBottom: '1px solid var(--line)',
                    cursor: 'pointer',
                    background: isSel ? 'rgba(111,168,179,.07)' : 'transparent',
                    boxShadow: isSel ? 'inset 2px 0 0 var(--accent)' : 'none',
                    transition: 'background .1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: tColor, letterSpacing: '.06em', fontWeight: 500, textTransform: 'uppercase' }}>
                      {type}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--graphite)', marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
                      {time}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: isSel ? 'var(--mist)' : 'var(--fog)', fontWeight: isSel ? 500 : 400 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 9, color: pColor, marginTop: 2, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                    {ev.provider}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: JSON viewer */}
          <div style={{ overflow: 'auto', background: '#0E1419' }}>
            {selectedEvent ? (
              <>
                <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: PROVIDER_COLORS[selectedEvent.provider], fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                    {selectedEvent.provider}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--steel)' }}>{deriveType(selectedEvent)}</span>
                  <span style={{ fontSize: 9, color: 'var(--graphite)', marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
                    {selectedEvent.ts}
                  </span>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '14px',
                    fontSize: 11,
                    lineHeight: 1.7,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    color: 'var(--fog)',
                    overflowX: 'auto',
                    whiteSpace: 'pre',
                  }}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              </>
            ) : (
              <div style={{ padding: '40px 24px', color: 'var(--graphite)', fontSize: 11 }}>
                Select an event to inspect its payload.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          <span className="label">Token field legend</span>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Keys',     color: '#9BC4CC' },
              { label: 'Strings',  color: '#C9B08A' },
              { label: 'Numbers',  color: '#7CA893' },
              { label: 'Booleans', color: '#B89FC9' },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: 0.8 }} />
                <span style={{ fontSize: 9, color: 'var(--steel)' }}>{label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ padding: '0 4px', background: 'rgba(201,150,107,.18)', borderRadius: 2, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#7CA893' }}>1840</div>
              <span style={{ fontSize: 9, color: 'var(--steel)' }}>Token field (amber)</span>
            </div>
          </div>
          <span style={{ fontSize: 9, color: 'var(--graphite)', marginLeft: 'auto' }}>
            {filteredEvents.length} events · Press ESC to close
          </span>
        </div>
      </div>
    </div>
  );
}
