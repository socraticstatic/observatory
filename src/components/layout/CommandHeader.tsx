'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Lookback, LOOKBACKS } from '@/lib/lookback';
import { trpc } from '@/lib/trpc-client';

interface Props {
  now: Date;
  lookback: Lookback;
  setLookback: (l: Lookback) => void;
  modelFilter: string;
  setModelFilter: (m: string) => void;
  onToggleSystemLog: () => void;
  systemLogOpen: boolean;
}

const LOOKBACK_KEYS = Object.keys(LOOKBACKS) as Lookback[];

const PROVIDER_META: Record<string, { label: string; dot: string }> = {
  anthropic:  { label: 'Claude',      dot: '#6FA8B3' },
  google:     { label: 'Gemini',      dot: '#8BA89C' },
  xai:        { label: 'Grok',        dot: '#B88A8A' },
  meta:       { label: 'Llama',       dot: '#9BA87C' },
  ollama:     { label: 'Ollama',      dot: '#A89276' },
  openai:     { label: 'OpenAI',      dot: '#7CA893' },
  elevenlabs: { label: 'ElevenLabs',  dot: '#C9966B' },
  leonardo:   { label: 'Leonardo',    dot: '#9B7CA8' },
  heygen:     { label: 'HeyGen',      dot: '#7C8BA8' },
};

// --- LiveBar ---

function LiveBar({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  const heights = buckets.map(n => 4 + (n / max) * 14);

  return (
    <div className="live-bar">
      {heights.map((h, i) => (
        <span key={`bar-${i}`} style={{ height: h }} />
      ))}
    </div>
  );
}

// --- DateRangeSlider ---

interface SliderProps {
  lookback: Lookback;
  setLookback: (l: Lookback) => void;
}

function DateRangeSlider({ lookback, setLookback }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const currentIdx = LOOKBACK_KEYS.indexOf(lookback);
  const pct = currentIdx / (LOOKBACK_KEYS.length - 1);

  const snapToNearest = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(rel * (LOOKBACK_KEYS.length - 1));
    setLookback(LOOKBACK_KEYS[idx]);
  }, [setLookback]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      snapToNearest(e.clientX);
    }
    function onUp() {
      dragging.current = false;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [snapToNearest]);

  return (
    <div
      ref={trackRef}
      className="range-track"
      style={{ minWidth: 100, maxWidth: 140 }}
      onMouseDown={(e) => {
        dragging.current = true;
        snapToNearest(e.clientX);
      }}
    >
      <div className="range-rail" />
      <div className="range-fill" style={{ left: 0, width: `${pct * 100}%` }} />

      {LOOKBACK_KEYS.map((key, i) => {
        const tp = (i / (LOOKBACK_KEYS.length - 1)) * 100;
        return (
          <span key={key}>
            <span
              className="range-tick"
              style={{ left: `${tp}%` }}
            />
            <span
              className="range-label"
              style={{ left: `${tp}%`, color: key === lookback ? 'var(--fog)' : undefined }}
            >
              {key}
            </span>
          </span>
        );
      })}

      <div
        className="range-handle"
        style={{ left: `${pct * 100}%` }}
        onMouseDown={(e) => {
          dragging.current = true;
          e.stopPropagation();
        }}
      />
    </div>
  );
}

// --- Avatar ---

function Avatar() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--ink-2), var(--accent))',
        border: '1.5px solid var(--slate)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--mist)',
        letterSpacing: '.06em',
      }}
    >
      HW
    </div>
  );
}

// --- IngestStatus ---

const STATUS_STYLE = {
  ok:    { color: 'var(--good)',    label: 'OK' },
  idle:  { color: '#C9966B',        label: 'IDLE' },
  error: { color: 'var(--bad)',     label: 'NO DATA' },
} as const;

function IngestStatus({ status, secondsAgo }: { status: 'ok' | 'idle' | 'error'; secondsAgo: number | null }) {
  const s = STATUS_STYLE[status];
  const ago = secondsAgo != null
    ? secondsAgo < 60
      ? `${secondsAgo}s ago`
      : `${Math.round(secondsAgo / 60)}m ago`
    : null;
  return (
    <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: s.color, letterSpacing: '.08em', textTransform: 'uppercase' }}>
      ingest <span style={{ opacity: .7 }}>{s.label}</span>
      {ago && status !== 'ok' && (
        <span style={{ color: 'var(--graphite)', marginLeft: 4 }}>{ago}</span>
      )}
    </span>
  );
}

// --- CommandHeader ---

export function CommandHeader({
  now,
  lookback,
  setLookback,
  modelFilter,
  setModelFilter,
  onToggleSystemLog,
  systemLogOpen,
}: Props) {
  void now;

  const { data: health } = trpc.health.status.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const { data: providerData } = trpc.who.providerBreakdown.useQuery({ lookback });

  const liveBuckets = health?.liveBuckets ?? Array(14).fill(0) as number[];
  const status = health?.status ?? 'ok';
  const secondsAgo = health?.secondsAgo ?? null;

  // Active providers in the current window — used to dim inactive pills
  const activeProviders = new Set(
    (providerData ?? []).map(p => p.provider)
  );

  // Always show all known providers — never collapse to what's active in window
  const providerToggles = [
    { id: 'ALL', label: 'ALL', dot: null as string | null, active: true },
    ...Object.entries(PROVIDER_META).map(([id, meta]) => ({
      id,
      label: meta.label,
      dot: meta.dot,
      active: activeProviders.has(id),
    })),
  ];

  return (
    <header className="cmd-header">
      {/* LEFT: live stream + bar + log button */}
      <div className="cmd-cell">
        <div className="live-lamp" />
        <span className="label" style={{ fontSize: 10, letterSpacing: '.14em' }}>
          Live Stream
        </span>
        <LiveBar buckets={liveBuckets} />
        <button
          className="mbtn"
          onClick={onToggleSystemLog}
          style={{
            border: `1px solid ${systemLogOpen ? 'var(--accent)' : 'var(--line-2)'}`,
            color: systemLogOpen ? 'var(--accent-2)' : 'var(--graphite)',
            marginLeft: 4,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {'{ }'}
        </button>
        <IngestStatus status={status} secondsAgo={secondsAgo} />
      </div>

      {/* CENTER: provider toggle */}
      <div className="cmd-cell" style={{ justifyContent: 'center' }}>
        <div className="model-toggle">
          {providerToggles.map(({ id, label, dot, active }) => (
            <button
              key={id}
              className={modelFilter === id ? 'on' : ''}
              onClick={() => setModelFilter(id)}
              style={{ opacity: modelFilter === id || active ? 1 : 0.35 }}
            >
              {dot && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dot,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
              )}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: date range slider + avatar */}
      <div className="cmd-cell" style={{ justifyContent: 'flex-end', gap: 12 }}>
        <DateRangeSlider lookback={lookback} setLookback={setLookback} />
        <Avatar />
      </div>
    </header>
  );
}
