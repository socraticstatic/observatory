'use client';

import { useState } from 'react';

type Status = 'ok' | 'warn' | 'bad';

interface Region {
  id: string;
  city: string;
  x: number;   // percent of viewBox width
  y: number;   // percent of viewBox height
  lat: number; // latency ms
  vol: number; // volume weight
  status: Status;
}

const regions: Region[] = [
  { id: 'us-east-1',      city: 'Virginia',   x: 28, y: 38, lat: 142, vol: 28, status: 'ok' },
  { id: 'us-west-2',      city: 'Oregon',     x: 14, y: 34, lat: 218, vol: 22, status: 'warn' },
  { id: 'eu-west-1',      city: 'Dublin',     x: 48, y: 30, lat: 92,  vol: 18, status: 'ok' },
  { id: 'eu-central-1',   city: 'Frankfurt',  x: 51, y: 33, lat: 108, vol: 14, status: 'ok' },
  { id: 'ap-south-1',     city: 'Mumbai',     x: 68, y: 48, lat: 284, vol: 9,  status: 'warn' },
  { id: 'ap-northeast-1', city: 'Tokyo',      x: 85, y: 40, lat: 312, vol: 11, status: 'warn' },
  { id: 'sa-east-1',      city: 'São Paulo',  x: 34, y: 68, lat: 402, vol: 4,  status: 'bad' },
];

const STATUS_COL: Record<Status, string> = {
  ok:   '#7CA893',
  warn: '#C9966B',
  bad:  '#B86B6B',
};

const VB_W = 820;
const VB_H = 340;

// Convert percent coords to viewBox absolute
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

// Cubic bezier arc from hub to node
function arcPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 30;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

export function WhereCard() {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; r: Region } | null>(null);

  return (
    <div className="card">
      {/* Header */}
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

      {/* Map */}
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

          {/* Landmasses */}
          {LAND_PATHS.map((d, i) => (
            <path key={i} d={d} fill="rgba(138,146,151,.09)" stroke="rgba(200,206,209,.25)" strokeWidth=".8" />
          ))}

          {/* Arc connections from hub to each region */}
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

          {/* Hub concentric circles */}
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

          {/* Region nodes */}
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
              <span style={{ color: 'var(--fog)', fontSize: 11 }}>Latency</span>
              <span className="num" style={{ fontSize: 11 }}>{tooltip.r.lat}ms</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: 'var(--fog)', fontSize: 11 }}>Volume</span>
              <span className="num" style={{ fontSize: 11 }}>{tooltip.r.vol}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
