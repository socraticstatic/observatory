'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Lookback, LOOKBACKS } from '@/lib/models';

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

const MODEL_TOGGLES: { id: string; label: string; dot: string | null }[] = [
  { id: 'all',    label: 'ALL',    dot: null },
  { id: 'claude', label: 'Claude', dot: '#6FA8B3' },
  { id: 'gemini', label: 'Gemini', dot: '#C9B08A' },
  { id: 'grok',   label: 'Grok',   dot: '#B88A8A' },
];

// --- LiveBar ---

function LiveBar() {
  const [heights, setHeights] = useState<number[]>(
    Array.from({ length: 14 }, () => 10)
  );

  useEffect(() => {
    setHeights(Array.from({ length: 14 }, () => 4 + Math.random() * 14));
    const id = setInterval(() => {
      setHeights(Array.from({ length: 14 }, () => 4 + Math.random() * 14));
    }, 240);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="live-bar">
      {heights.map((h, i) => (
        <span key={i} style={{ height: h }} />
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
        background: 'linear-gradient(135deg, #1E2B2F, #6FA8B3)',
        border: '1.5px solid #44545B',
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
  return (
    <header className="cmd-header">
      {/* LEFT: live stream + bar + log button */}
      <div className="cmd-cell">
        <div className="live-lamp" />
        <span className="label" style={{ fontSize: 10, letterSpacing: '.14em' }}>
          Live Stream
        </span>
        <LiveBar />
        <button
          className="mbtn"
          onClick={onToggleSystemLog}
          style={{
            border: `1px solid ${systemLogOpen ? 'var(--accent)' : '#44545B'}`,
            color: systemLogOpen ? 'var(--accent-2)' : '#44545B',
            marginLeft: 4,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {'{ }'}
        </button>
        <span
          style={{
            fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--good)',
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          ingest <span style={{ opacity: .7 }}>OK</span>
        </span>
      </div>

      {/* CENTER: model toggle */}
      <div className="cmd-cell" style={{ justifyContent: 'center' }}>
        <div className="model-toggle">
          {MODEL_TOGGLES.map(({ id, label, dot }) => (
            <button
              key={id}
              className={modelFilter === id ? 'on' : ''}
              onClick={() => setModelFilter(id)}
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
