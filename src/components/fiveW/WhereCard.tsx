'use client';

import { useState, Fragment } from 'react';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const W = 820;
const H = 340;

const LANDMASSES = [
  "M 120 80 Q 140 60 180 65 Q 210 55 240 70 Q 270 60 300 72 Q 320 78 330 95 Q 340 110 325 125 Q 300 135 270 130 Q 245 138 220 132 Q 200 140 180 135 Q 155 132 135 120 Q 115 105 120 80 Z",
  "M 370 75 Q 420 60 470 70 Q 510 65 555 78 Q 590 82 620 95 Q 640 110 615 130 Q 580 140 540 135 Q 500 142 465 135 Q 420 138 385 125 Q 360 110 370 75 Z",
  "M 400 160 Q 440 150 480 160 Q 510 155 540 170 Q 555 185 535 205 Q 500 218 465 210 Q 430 215 405 200 Q 385 180 400 160 Z",
  "M 610 140 Q 660 130 710 145 Q 740 150 755 170 Q 745 195 710 205 Q 670 210 635 198 Q 605 180 610 140 Z",
  "M 200 200 Q 230 190 265 200 Q 290 195 310 215 Q 320 240 300 260 Q 270 275 240 268 Q 210 260 195 235 Q 190 215 200 200 Z",
  "M 720 230 Q 760 220 790 235 Q 800 255 785 275 Q 755 285 730 275 Q 715 255 720 230 Z",
];

const REGION_META: Record<string, { city: string; x: number; y: number }> = {
  'us-east-1':      { city: 'Virginia',   x: 28, y: 38 },
  'us-east-2':      { city: 'Ohio',       x: 26, y: 36 },
  'us-west-1':      { city: 'N. Cal',     x: 12, y: 36 },
  'us-west-2':      { city: 'Oregon',     x: 14, y: 34 },
  'ca-central-1':   { city: 'Montreal',   x: 27, y: 30 },
  'eu-west-1':      { city: 'Dublin',     x: 48, y: 30 },
  'eu-west-2':      { city: 'London',     x: 50, y: 28 },
  'eu-west-3':      { city: 'Paris',      x: 51, y: 30 },
  'eu-central-1':   { city: 'Frankfurt',  x: 53, y: 32 },
  'eu-north-1':     { city: 'Stockholm',  x: 54, y: 24 },
  'ap-south-1':     { city: 'Mumbai',     x: 68, y: 48 },
  'ap-southeast-1': { city: 'Singapore',  x: 78, y: 58 },
  'ap-southeast-2': { city: 'Sydney',     x: 82, y: 72 },
  'ap-northeast-1': { city: 'Tokyo',      x: 85, y: 40 },
  'ap-northeast-2': { city: 'Seoul',      x: 84, y: 38 },
  'ap-east-1':      { city: 'Hong Kong',  x: 82, y: 45 },
  'sa-east-1':      { city: 'São Paulo',  x: 34, y: 68 },
  'af-south-1':     { city: 'Cape Town',  x: 54, y: 72 },
  'me-south-1':     { city: 'Bahrain',    x: 62, y: 44 },
};

type Status = 'ok' | 'warn' | 'bad';

const STATUS_COL: Record<Status, string> = {
  ok:   '#7CA893',
  warn: '#C9966B',
  bad:  '#B86B6B',
};

function latencyStatus(ms: number): Status {
  if (ms < 150) return 'ok';
  if (ms < 300) return 'warn';
  return 'bad';
}

interface Props {
  lookback?: Lookback;
  provider?: string;
}

export function WhereCard({ lookback = '24H', provider }: Props) {
  const [hover, setHover] = useState<{ r: { id: string; name: string; city: string; lat: number; vol: number; status: Status; x: number; y: number }; x: number; y: number } | null>(null);
  const { data: raw } = trpc.where.regional.useQuery({ lookback, provider });

  const totalCalls = (raw ?? []).reduce((s, r) => s + r.calls, 0) || 1;

  const regions = (raw ?? []).map(r => {
    const meta = REGION_META[r.region] ?? { city: r.region, x: 50, y: 50 };
    return {
      id: r.region,
      name: r.region,
      city: meta.city,
      x: meta.x,
      y: meta.y,
      lat: Math.round(r.avgLatMs),
      vol: Math.round((r.calls / totalCalls) * 100),
      status: latencyStatus(r.avgLatMs),
    };
  });

  const hub = { x: W * 0.5, y: H * 0.44 };

  return (
    <div className="card">
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label">WHERE</span>
            <span style={{ width: 14, height: 1, background: 'var(--line-2)', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Regional Latency</span>
          </div>
          <div className="label" style={{ marginTop: 4, color: 'var(--graphite)' }}>Origin-to-inference round trip</div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--steel)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {(['ok', 'warn', 'bad'] as Status[]).map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COL[s], display: 'inline-block' }} />
              {s === 'ok' ? '<150ms' : s === 'warn' ? '150–300' : '>300'}
            </span>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', padding: 8 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          <defs>
            <pattern id="geoGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(138,146,151,.06)" strokeWidth=".6" />
            </pattern>
            <radialGradient id="glowOk">  <stop offset="0" stopColor="#7CA893" stopOpacity=".5" /><stop offset="1" stopColor="#7CA893" stopOpacity="0" /></radialGradient>
            <radialGradient id="glowWarn"><stop offset="0" stopColor="#C9966B" stopOpacity=".5" /><stop offset="1" stopColor="#C9966B" stopOpacity="0" /></radialGradient>
            <radialGradient id="glowBad"> <stop offset="0" stopColor="#B86B6B" stopOpacity=".6" /><stop offset="1" stopColor="#B86B6B" stopOpacity="0" /></radialGradient>
          </defs>

          <rect x="0" y="0" width={W} height={H} fill="url(#geoGrid)" />

          {[0.25, 0.5, 0.75].map((p, i) => (
            <Fragment key={i}>
              <line x1="0" x2={W} y1={H * p} y2={H * p} stroke="rgba(138,146,151,.12)" strokeDasharray="2 4" />
              <line y1="0" y2={H} x1={W * p} x2={W * p} stroke="rgba(138,146,151,.12)" strokeDasharray="2 4" />
            </Fragment>
          ))}

          {LANDMASSES.map((d, i) => (
            <path key={i} d={d} fill="rgba(138,146,151,.09)" stroke="rgba(200,206,209,.25)" strokeWidth=".8" />
          ))}

          {regions.map((r, i) => {
            const cx = W * r.x / 100;
            const cy = H * r.y / 100;
            const col = STATUS_COL[r.status];
            return (
              <path
                key={i}
                d={`M ${hub.x} ${hub.y} Q ${(cx + hub.x) / 2} ${(cy + hub.y) / 2 - 40} ${cx} ${cy}`}
                stroke={col} strokeWidth=".8" fill="none" strokeDasharray="3 3" opacity=".4"
              />
            );
          })}

          <g>
            <circle cx={hub.x} cy={hub.y} r="14" fill="none" stroke="var(--accent)" strokeWidth=".6" opacity=".5" />
            <circle cx={hub.x} cy={hub.y} r="7"  fill="none" stroke="var(--accent)" strokeWidth=".8" />
            <circle cx={hub.x} cy={hub.y} r="3"  fill="var(--accent)" />
          </g>

          {regions.map(r => {
            const cx = W * r.x / 100;
            const cy = H * r.y / 100;
            const col = STATUS_COL[r.status];
            const glow = r.status === 'ok' ? 'glowOk' : r.status === 'warn' ? 'glowWarn' : 'glowBad';
            const rad = 4 + r.vol * 0.4;
            return (
              <g
                key={r.id}
                onMouseEnter={e => setHover({ r, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setHover({ r, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'crosshair' }}
              >
                <circle cx={cx} cy={cy} r={rad + 14} fill={`url(#${glow})`} />
                <circle cx={cx} cy={cy} r={rad} fill={col} stroke="rgba(233,236,236,.4)" strokeWidth=".8" />
                <circle cx={cx} cy={cy} r={rad + 3} fill="none" stroke={col} strokeWidth=".6" opacity=".5" />
                <text x={cx + rad + 6} y={cy + 3} fill="var(--fog)" fontFamily="JetBrains Mono" fontSize="9" letterSpacing=".5">
                  {r.name} · {r.lat}ms
                </text>
              </g>
            );
          })}

          {regions.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--steel)" fontSize="12" fontFamily="JetBrains Mono">
              No regional data
            </text>
          )}
        </svg>

        {hover && (
          <div className="tt" style={{ position: 'fixed', left: hover.x + 14, top: hover.y + 8, zIndex: 9999 }}>
            <div className="label" style={{ marginBottom: 6, color: 'var(--accent-2)' }}>{hover.r.name}</div>
            <div style={{ fontSize: 11, color: 'var(--fog)', marginBottom: 4 }}>{hover.r.city}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span className="label" style={{ fontSize: 9 }}>Round trip</span>
              <span className="num">{hover.r.lat}ms</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span className="label" style={{ fontSize: 9 }}>Volume</span>
              <span className="num">{hover.r.vol}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span className="label" style={{ fontSize: 9 }}>Status</span>
              <span className="num" style={{ color: STATUS_COL[hover.r.status], textTransform: 'uppercase' }}>{hover.r.status}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
