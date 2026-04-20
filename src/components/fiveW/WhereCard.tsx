'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

type Status = 'ok' | 'warn' | 'bad';

interface Region {
  id: string;
  city: string;
  x: number;
  y: number;
  lat: number;
  vol: number;
  status: Status;
}

// Static coordinate lookup for known AWS region IDs
const REGION_META: Record<string, { city: string; x: number; y: number }> = {
  'us-east-1':      { city: 'Virginia',   x: 28, y: 38 },
  'us-east-2':      { city: 'Ohio',       x: 26, y: 36 },
  'us-west-1':      { city: 'California', x: 12, y: 40 },
  'us-west-2':      { city: 'Oregon',     x: 14, y: 34 },
  'eu-west-1':      { city: 'Dublin',     x: 48, y: 30 },
  'eu-west-2':      { city: 'London',     x: 49, y: 28 },
  'eu-west-3':      { city: 'Paris',      x: 50, y: 31 },
  'eu-central-1':   { city: 'Frankfurt',  x: 51, y: 33 },
  'eu-north-1':     { city: 'Stockholm',  x: 52, y: 24 },
  'ap-south-1':     { city: 'Mumbai',     x: 68, y: 48 },
  'ap-southeast-1': { city: 'Singapore',  x: 78, y: 58 },
  'ap-southeast-2': { city: 'Sydney',     x: 84, y: 74 },
  'ap-northeast-1': { city: 'Tokyo',      x: 85, y: 40 },
  'ap-northeast-2': { city: 'Seoul',      x: 83, y: 38 },
  'ap-east-1':      { city: 'Hong Kong',  x: 80, y: 44 },
  'sa-east-1':      { city: 'São Paulo',  x: 34, y: 68 },
  'ca-central-1':   { city: 'Montreal',   x: 25, y: 30 },
  'me-south-1':     { city: 'Bahrain',    x: 61, y: 44 },
  'af-south-1':     { city: 'Cape Town',  x: 52, y: 78 },
};

function latencyToStatus(ms: number): Status {
  if (ms < 200) return 'ok';
  if (ms < 400) return 'warn';
  return 'bad';
}

const STATUS_COL: Record<Status, string> = {
  ok:   '#7CA893',
  warn: '#C9966B',
  bad:  '#B86B6B',
};

const VB_W = 820;
const VB_H = 340;

const px = (pct: number) => (pct / 100) * VB_W;
const py = (pct: number) => (pct / 100) * VB_H;

const HUB_X = VB_W * 0.5;
const HUB_Y = VB_H * 0.44;

const LAND_PATHS = [
  'M 120 80 Q 140 60 180 65 Q 210 55 240 70 Q 270 60 300 72 Q 320 78 330 95 Q 340 110 325 125 Q 300 135 270 130 Q 245 138 220 132 Q 200 140 180 135 Q 155 132 135 120 Q 115 105 120 80 Z',
  'M 370 75 Q 420 60 470 70 Q 510 65 555 78 Q 590 82 620 95 Q 640 110 615 130 Q 580 140 540 135 Q 500 142 465 135 Q 420 138 385 125 Q 360 110 370 75 Z',
  'M 400 160 Q 440 150 480 160 Q 510 155 540 170 Q 555 185 535 205 Q 500 218 465 210 Q 430 215 405 200 Q 385 180 400 160 Z',
  'M 610 140 Q 660 130 710 145 Q 740 150 755 170 Q 745 195 710 205 Q 670 210 635 198 Q 605 180 610 140 Z',
  'M 200 200 Q 230 190 265 200 Q 290 195 310 215 Q 320 240 300 260 Q 270 275 240 268 Q 210 260 195 235 Q 190 215 200 200 Z',
  'M 720 230 Q 760 220 790 235 Q 800 255 785 275 Q 755 285 730 275 Q 715 255 720 230 Z',
];

function arcPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 30;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

interface Props {
  lookback?: Lookback;
}

export function WhereCard({ lookback = '24H' }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; r: Region } | null>(null);

  const { data: raw } = trpc.where.regional.useQuery({ lookback });

  const regions: Region[] = (() => {
    if (!raw || raw.length === 0) return [];
    const totalCalls = raw.reduce((s, r) => s + r.calls, 0) || 1;
    let unknownIdx = 0;
    // Fallback x/y positions for regions not in lookup (spread around edges)
    const FALLBACKS = [
      { x: 60, y: 55 }, { x: 35, y: 55 }, { x: 70, y: 65 },
      { x: 20, y: 55 }, { x: 75, y: 30 }, { x: 40, y: 75 },
    ];
    return raw.map(r => {
      const meta = REGION_META[r.region];
      const pos = meta ?? FALLBACKS[unknownIdx++ % FALLBACKS.length];
      return {
        id: r.region,
        city: meta?.city ?? r.region,
        x: pos.x,
        y: pos.y,
        lat: r.avgLatMs,
        vol: Math.round((r.calls / totalCalls) * 100),
        status: latencyToStatus(r.avgLatMs),
      };
    });
  })();

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <span className="label">WHERE &middot; Regional Distribution</span>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['ok', 'warn', 'bad'] as Status[]).map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COL[s], display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.12em', textTransform: 'uppercase' }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '8px 0', position: 'relative' }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            {regions.map(r => (
              <radialGradient key={r.id} id={`glow-${r.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={STATUS_COL[r.status]} stopOpacity=".55" />
                <stop offset="100%" stopColor={STATUS_COL[r.status]} stopOpacity="0" />
              </radialGradient>
            ))}
            <radialGradient id="hub-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity=".45" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {LAND_PATHS.map((d, i) => (
            <path key={i} d={d} fill="rgba(138,146,151,.09)" stroke="rgba(200,206,209,.25)" strokeWidth=".8" />
          ))}

          {regions.map(r => {
            const rx = px(r.x);
            const ry = py(r.y);
            return (
              <path
                key={`arc-${r.id}`}
                d={arcPath(HUB_X, HUB_Y, rx, ry)}
                fill="none"
                stroke={STATUS_COL[r.status]}
                strokeWidth=".8"
                strokeDasharray="4,4"
                opacity=".5"
              />
            );
          })}

          {[24, 14, 6].map((radius, i) => (
            <circle
              key={i}
              cx={HUB_X}
              cy={HUB_Y}
              r={radius}
              fill={i === 2 ? 'var(--accent)' : 'none'}
              stroke="var(--accent)"
              strokeWidth={i === 2 ? 0 : .8}
              opacity={i === 0 ? .15 : i === 1 ? .3 : .9}
            />
          ))}
          <circle cx={HUB_X} cy={HUB_Y} r={36} fill="url(#hub-glow)" />
          <text x={HUB_X} y={HUB_Y + 44} textAnchor="middle" fill="var(--accent)"
            fontSize={9} fontFamily="JetBrains Mono, monospace" letterSpacing=".12em">HUB</text>

          {regions.length === 0 && (
            <text x={HUB_X} y={HUB_Y + 70} textAnchor="middle" fill="var(--steel)"
              fontSize={10} fontFamily="JetBrains Mono, monospace">No regional data</text>
          )}

          {regions.map(r => {
            const rx = px(r.x);
            const ry = py(r.y);
            const nodeR = 4 + r.vol * 0.4;
            const glowR = nodeR * 2.8;
            return (
              <g
                key={r.id}
                style={{ cursor: 'pointer' }}
                onMouseMove={e => setTooltip({ x: e.clientX, y: e.clientY, r })}
                onMouseLeave={() => setTooltip(null)}
              >
                <circle cx={rx} cy={ry} r={glowR} fill={`url(#glow-${r.id})`} />
                <circle cx={rx} cy={ry} r={nodeR} fill={STATUS_COL[r.status]} opacity=".85" />
                <circle cx={rx} cy={ry} r={nodeR} fill="none" stroke={STATUS_COL[r.status]} strokeWidth=".8" opacity=".5" />
                <text x={rx} y={ry + nodeR + 10} textAnchor="middle"
                  fill="var(--fog)" fontSize={8.5} fontFamily="JetBrains Mono, monospace">
                  {r.city}
                </text>
              </g>
            );
          })}
        </svg>

        {tooltip && (
          <div className="tt" style={{ left: tooltip.x + 12, top: tooltip.y - 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COL[tooltip.r.status], display: 'inline-block' }} />
              <span style={{ fontWeight: 600, fontSize: 12 }}>{tooltip.r.city}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--steel)', marginBottom: 4 }}>{tooltip.r.id}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
              <span style={{ color: 'var(--fog)', fontSize: 11 }}>Avg latency</span>
              <span className="num" style={{ fontSize: 11 }}>{tooltip.r.lat}ms</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: 'var(--fog)', fontSize: 11 }}>Traffic share</span>
              <span className="num" style={{ fontSize: 11 }}>{tooltip.r.vol}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
