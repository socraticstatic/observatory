'use client';

import { useState, useEffect, useCallback } from 'react';

interface Props {
  onClose: () => void;
}

type Provider = 'all' | 'anthropic' | 'google' | 'xai';

interface StreamEvent {
  id: number;
  ts: string;
  provider: string;
  type: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

const EVENTS: StreamEvent[] = [
  {
    id: 1,
    ts: '2026-04-19T09:14:22.441Z',
    provider: 'anthropic',
    type: 'request',
    label: 'claude-opus-4.5 · tools/call',
    data: {
      id: 'req_01XKv9m2PL4rFqNd7',
      model: 'claude-opus-4-5',
      type: 'message',
      role: 'user',
      usage: { input_tokens: 2184, output_tokens: 412, cache_read_input_tokens: 1840, cache_creation_input_tokens: 0 },
      tool_use: { name: 'browser.search', input: { query: 'Q4 market analysis 2026' } },
    },
  },
  {
    id: 2,
    ts: '2026-04-19T09:14:22.986Z',
    provider: 'anthropic',
    type: 'response',
    label: 'claude-opus-4.5 · 412 tok out',
    data: {
      id: 'msg_01HzV2pLKmN8qrTw3',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-4-5',
      stop_reason: 'tool_use',
      usage: { input_tokens: 2184, output_tokens: 412, cache_read_input_tokens: 1840 },
      content: [{ type: 'tool_use', id: 'toolu_01A09q90qw90lq452J3pxr0w', name: 'browser.search' }],
    },
  },
  {
    id: 3,
    ts: '2026-04-19T09:14:23.270Z',
    provider: 'anthropic',
    type: 'cache_hit',
    label: 'cache lookup · 1840 tok saved',
    data: {
      event: 'cache_read',
      cache_key: 'sys_prompt_v14_hash_9fa3bc',
      tokens_saved: 1840,
      latency_ms: 42,
      cost_saved_usd: 0.0184,
    },
  },
  {
    id: 4,
    ts: '2026-04-19T09:14:24.112Z',
    provider: 'google',
    type: 'request',
    label: 'gemini-2.5-pro · generateContent',
    data: {
      model: 'models/gemini-2.5-pro',
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      usageMetadata: { promptTokenCount: 3840, candidatesTokenCount: 0, totalTokenCount: 3840 },
      contents: [{ role: 'user', parts: [{ text: '[truncated 3.8K tokens]' }] }],
    },
  },
  {
    id: 5,
    ts: '2026-04-19T09:14:26.340Z',
    provider: 'google',
    type: 'response',
    label: 'gemini-2.5-pro · 892 tok out',
    data: {
      model: 'models/gemini-2.5-pro',
      usageMetadata: { promptTokenCount: 3840, candidatesTokenCount: 892, totalTokenCount: 4732 },
      candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: '[truncated]' }] } }],
      cost_usd: 0.0238,
    },
  },
  {
    id: 6,
    ts: '2026-04-19T09:14:27.018Z',
    provider: 'xai',
    type: 'request',
    label: 'grok-3 · chat/completions',
    data: {
      model: 'grok-3',
      messages: [{ role: 'user', content: '[truncated]' }],
      temperature: 0.6,
      max_tokens: 1024,
      stream: false,
      usage: { prompt_tokens: 502, completion_tokens: 0, total_tokens: 502 },
    },
  },
  {
    id: 7,
    ts: '2026-04-19T09:14:28.444Z',
    provider: 'xai',
    type: 'response',
    label: 'grok-3 · 318 tok out',
    data: {
      id: 'chatcmpl-xai-8FpQ4rTv2mKn',
      model: 'grok-3',
      object: 'chat.completion',
      usage: { prompt_tokens: 502, completion_tokens: 318, total_tokens: 820 },
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '[truncated]' } }],
      cost_usd: 0.0082,
    },
  },
];

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#D97757',
  google:    '#8BA89C',
  xai:       '#B88A8A',
};

const TYPE_COLORS: Record<string, string> = {
  request:   'var(--steel)',
  response:  'var(--accent)',
  cache_hit: '#7A9E8A',
};

// Simple JSON syntax highlighter
function highlight(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Keys
    .replace(/"([^"]+)":/g, '<span style="color:#8BA89C">"$1"</span>:')
    // String values (not keys)
    .replace(/:\s*"([^"]*)"/g, ': <span style="color:#A89276">"$1"</span>')
    // Numbers
    .replace(/:\s*(-?\d+\.?\d*)/g, (_m, n) => {
      const isToken = false;
      return `: <span style="color:#9EA87A${isToken ? ';background:rgba(201,150,107,.15);border-radius:2px;padding:0 2px' : ''}">${n}</span>`;
    })
    // Booleans
    .replace(/:\s*(true|false)/g, ': <span style="color:#B89FC9">$1</span>');
}

function highlightTokenFields(html: string): string {
  // Amber highlight for token count values
  return html.replace(
    /("(input_tokens|output_tokens|cache_read_input_tokens|cache_creation_input_tokens|prompt_tokens|completion_tokens|total_tokens|tokens_saved|promptTokenCount|candidatesTokenCount|totalTokenCount|candidatesTokenCount)"<\/span>:\s*<span style="color:#7CA893">)(\d+)(<\/span>)/g,
    '$1<span style="background:rgba(201,150,107,.18);border-radius:2px;padding:0 2px">$3</span>$4'
  );
}

export function SystemLogOverlay({ onClose }: Props) {
  const [selected, setSelected] = useState<number>(1);
  const [provider, setProvider] = useState<Provider>('all');
  const [paused, setPaused] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>(EVENTS);

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
        // silently fall back to static events; close stream
        evtSource?.close();
      };
    } catch {
      // environment without EventSource: keep static events
    }
    return () => { evtSource?.close(); };
  }, [paused, provider]);

  const selectedEvent = events.find(e => e.id === selected) ?? events[0] ?? EVENTS[0];

  const filteredEvents = provider === 'all'
    ? events
    : events.filter(e => e.provider === provider);

  const prettyJson = JSON.stringify(selectedEvent.data, null, 2);
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
      {/* Panel */}
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
          {/* Streaming status */}
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
              {paused ? 'Paused' : 'Streaming'}
            </span>
          </div>

          {/* Provider filters */}
          <div className="seg" style={{ marginLeft: 8 }}>
            {(['all', 'anthropic', 'google', 'xai'] as Provider[]).map(p => (
              <button
                key={p}
                className={provider === p ? 'on' : ''}
                onClick={() => setProvider(p)}
                style={{
                  ...(provider === p && p !== 'all' ? { color: PROVIDER_COLORS[p] } : {}),
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="mbtn"
              onClick={() => setPaused(v => !v)}
            >
              {paused ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polygon points="2,1 9,5 2,9" fill="currentColor" />
                  </svg>
                  Resume
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <rect x="1" y="1" width="3" height="8" fill="currentColor" rx="1" />
                    <rect x="6" y="1" width="3" height="8" fill="currentColor" rx="1" />
                  </svg>
                  Pause
                </>
              )}
            </button>
            <button
              className="mbtn"
              onClick={onClose}
              aria-label="Close overlay"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" />
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              ESC
            </button>
          </div>
        </div>

        {/* Body: event list + JSON viewer */}
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', flex: 1, overflow: 'hidden' }}>
          {/* Left: event list */}
          <div style={{ borderRight: '1px solid var(--line)', overflow: 'auto' }}>
            {filteredEvents.map((ev) => {
              const isSel = ev.id === selected;
              const pColor = PROVIDER_COLORS[ev.provider] ?? 'var(--steel)';
              const tColor = TYPE_COLORS[ev.type] ?? 'var(--steel)';
              const time = new Date(ev.ts).toISOString().slice(11, 23);

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
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: pColor, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 10, color: tColor, letterSpacing: '.06em', fontWeight: 500, textTransform: 'uppercase' }}>
                      {ev.type}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--graphite)', marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
                      {time}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: isSel ? 'var(--mist)' : 'var(--fog)', fontWeight: isSel ? 500 : 400 }}>
                    {ev.label}
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
            <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: PROVIDER_COLORS[selectedEvent.provider], fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {selectedEvent.provider}
              </span>
              <span style={{ fontSize: 10, color: 'var(--steel)' }}>{selectedEvent.type}</span>
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
          </div>
        </div>

        {/* Footer: token legend */}
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
              { label: 'Keys', color: '#8BA89C' },
              { label: 'Strings', color: '#A89276' },
              { label: 'Numbers', color: '#9EA87A' },
              { label: 'Booleans', color: '#B89FC9' },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: 0.8 }} />
                <span style={{ fontSize: 9, color: 'var(--steel)' }}>{label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ padding: '0 4px', background: 'rgba(201,150,107,.18)', borderRadius: 2, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#9EA87A' }}>
                1840
              </div>
              <span style={{ fontSize: 9, color: 'var(--steel)' }}>Token field (amber highlight)</span>
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
