'use client';

interface Props {
  data: number[];
  color?: string;
  h?: number;
  w?: number;
  area?: boolean;
}

export function Sparkline({ data, color = 'var(--accent)', h = 36, w = 120, area = true }: Props) {
  if (!data || data.length < 2) return <svg width={w} height={h} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const norm = (v: number) => (v - min) / range;

  const pts = data.map((v, i): [number, number] => [
    (i / (data.length - 1)) * w,
    h - norm(v) * (h - 2) - 1,
  ]);

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');

  const areaD = `${d} L ${w},${h} L 0,${h} Z`;

  const gradId = `spg-${color.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".35" />
          <stop offset="100%" stopColor={color} stopOpacity=".0" />
        </linearGradient>
      </defs>
      {area && (
        <path d={areaD} fill={`url(#${gradId})`} />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
