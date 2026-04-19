'use client';

interface Props {
  open: boolean;
  accent: string;
  density: 'comfortable' | 'compact' | 'dense';
  showTicker: boolean;
  onAccentChange: (v: string) => void;
  onDensityChange: (v: 'comfortable' | 'compact' | 'dense') => void;
  onTickerChange: (v: boolean) => void;
}

export function TweaksPanel({ open, accent, density, showTicker, onAccentChange, onDensityChange, onTickerChange }: Props) {
  // oklch hue in range 160-240
  function hueFromAccent(hex: string): number {
    // default to mid-range if we can't parse
    return 200;
  }

  function handleHueChange(hue: number) {
    // Convert oklch hue to an approximate CSS color for CSS var
    // We set the CSS variable directly and emit the value
    const css = `oklch(0.62 0.09 ${hue})`;
    document.documentElement.style.setProperty('--accent', css);
    onAccentChange(css);
  }

  return (
    <div className={`tweaks${open ? ' on' : ''}`}>
      <h4>
        <span>Tweaks</span>
        <span className="mono kbd">⌥T</span>
      </h4>

      <label>
        <span>Accent hue</span>
        <input
          type="range"
          min={160}
          max={240}
          defaultValue={200}
          onChange={e => handleHueChange(Number(e.target.value))}
        />
      </label>

      <label>
        <span>Density</span>
        <select
          value={density}
          onChange={e => onDensityChange(e.target.value as Props['density'])}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
          <option value="dense">Dense</option>
        </select>
      </label>

      <label>
        <span>Show ticker</span>
        <input
          type="checkbox"
          checked={showTicker}
          onChange={e => onTickerChange(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
      </label>

      <div style={{ marginTop: 12, fontSize: 9, color: 'var(--graphite)', letterSpacing: '.08em' }}>
        Changes persist to preferences
      </div>
    </div>
  );
}
