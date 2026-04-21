'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const W = 820;
const H = 340;

const LANDMASS_PATHS = [
  "M 120 80 Q 140 60 180 65 Q 210 55 240 70 Q 270 60 300 72 Q 320 78 330 95 Q 340 110 325 125 Q 300 135 270 130 Q 245 138 220 132 Q 200 140 180 135 Q 155 132 135 120 Q 115 105 120 80 Z",
  "M 370 75 Q 420 60 470 70 Q 510 65 555 78 Q 590 82 620 95 Q 640 110 615 130 Q 580 140 540 135 Q 500 142 465 135 Q 420 138 385 125 Q 360 110 370 75 Z",
  "M 400 160 Q 440 150 480 160 Q 510 155 540 170 Q 555 185 535 205 Q 500 218 465 210 Q 430 215 405 200 Q 385 180 400 160 Z",
  "M 610 140 Q 660 130 710 145 Q 740 150 755 170 Q 745 195 710 205 Q 670 210 635 198 Q 605 180 610 140 Z",
  "M 200 200 Q 230 190 265 200 Q 290 195 310 215 Q 320 240 300 260 Q 270 275 240 268 Q 210 260 195 235 Q 190 215 200 200 Z",
  "M 720 230 Q 760 220 790 235 Q 800 255 785 275 Q 755 285 730 275 Q 715 255 720 230 Z",
];

const REGION_COORDS: Record<string, { x: number; y: number; city: string }> = {
  'us-east-1':      { x: 28, y: 38, city: 'Virginia'  },
  'us-west-2':      { x: 14, y: 34, city: 'Oregon'    },
  'eu-west-1':      { x: 48, y: 30, city: 'Dublin'    },
  'eu-central-1':   { x: 51, y: 33, city: 'Frankfurt' },
  'ap-south-1':     { x: 68, y: 48, city: 'Mumbai'    },
  'ap-northeast-1': { x: 85, y: 40, city: 'Tokyo'     },
  'sa-east-1':      { x: 34, y: 68, city: 'São Paulo' },
};

type Status = 'ok' | 'warn' | 'bad';

const STATUS_COLOR: Record<Status, string> = {
  ok:   'var(--good)',
  warn: 'var(--warn)',
  bad:  'var(--bad)',
};

const FALLBACK_REGIONS: Array<{ id: string; lat: number; vol: number; status: Status }> = [
  { id: 'us-east-1',      lat: 142, vol: 28, status: 'ok'   },
  { id: 'us-west-2',      lat: 218, vol: 22, status: 'warn' },
  { id: 'eu-west-1',      lat: 92,  vol: 18, status: 'ok'   },
  { id: 'eu-central-1',   lat: 108, vol: 14, status: 'ok'   },
  { id: 'ap-south-1',     lat: 284, vol: 9,  status: 'warn' },
  { id: 'ap-northeast-1', lat: 312, vol: 11, status: 'warn' },
  { id: 'sa-east-1',      lat: 402, vol: 4,  status: 'bad'  },
];

function latToStatus(lat: number): Status {
  if (lat < 150) return 'ok';
  if (lat < 300) return 'warn';
  return 'bad';
}

interface RegionData {
  id: string;
  lat: number;
  vol: number;
  status: Status;
}

interface TooltipInfo {
  id: string;
  city: string;
  lat: number;
  vol: number;
  status: Status;
}

interface Props {
  lookback: Lookback;
  provider?: string;
}

const HUB_X = W * 0.5;
const HUB_Y = H * 0.44;

export function WhereCard({ lookback, provider }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { data: raw } = trpc.where.regional.useQuery({ lookback, provider });

  const regions: RegionData[] = (() => {
    if (!raw || raw.length === 0) return FALLBACK_REGIONS;
    const totalCalls = raw.reduce((s, r) => s + r.calls, 0) || 1;
    const mapped: RegionData[] = [];
    for (const r of raw) {
      if (!REGION_COORDS[r.region]) continue;
      mapped.push({
        id: r.region,
        lat: r.avgLatMs,
        vol: Math.round((r.calls / totalCalls) * 100),
        status: latToStatus(r.avgLatMs),
      });
    }
    return mapped.length > 0 ? mapped : FALLBACK_REGIONS;
  })();

  const hoveredRegion: TooltipInfo | null = (() => {
    if (!hovered) return null;
    const r = regions.find(rr => rr.id === hovered);
    const coord = REGION_COORDS[hovered];
    if (!r || !coord) return null;
    return { id: hovered, city: coord.city, lat: r.lat, vol: r.vol, status: r.status };
  })();

  return (
    <div className="card" style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--line)',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 2 }}>
            WHERE
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.2 }}>Regional Latency</div>
          <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>Origin-to-inference round trip</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {([['ok', '<150ms'], ['warn', '150–300ms'], ['bad', '>300ms']] as [Status, string][]).map(([s, label]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[s], display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: 'var(--steel)', letterSpacing: '.08em' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Map */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block' }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <pattern id="geoGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          </pattern>

          {regions.map(r => {
            const color = STATUS_COLOR[r.status];
            return (
              <radialGradient key={`glow-${r.id}`} id={`glow-${r.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </radialGradient>
            );
          })}
        </defs>

        {/* Background */}
        <rect width={W} height={H} fill="var(--panel)" />
        <rect width={W} height={H} fill="url(#geoGrid)" />

        {/* Landmasses */}
        {LANDMASS_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="rgba(255,255,255,0.06)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.5"
          />
        ))}

        {/* Arcs from hub to each region */}
        {regions.map(r => {
          const coord = REGION_COORDS[r.id];
          if (!coord) return null;
          const cx = (coord.x / 100) * W;
          const cy = (coord.y / 100) * H;
          const qx = (cx + HUB_X) / 2;
          const qy = (cy + HUB_Y) / 2 - 40;
          const color = STATUS_COLOR[r.status];
          return (
            <path
              key={`arc-${r.id}`}
              d={`M ${HUB_X} ${HUB_Y} Q ${qx} ${qy} ${cx} ${cy}`}
              fill="none"
              stroke={color}
              strokeWidth="0.8"
              strokeDasharray="3 3"
              opacity="0.5"
            />
          );
        })}

        {/* Hub */}
        <circle
          cx={HUB_X}
          cy={HUB_Y}
          r={5}
          fill="rgba(111,168,179,0.3)"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />

        {/* Region nodes */}
        {regions.map(r => {
          const coord = REGION_COORDS[r.id];
          if (!coord) return null;
          const cx = (coord.x / 100) * W;
          const cy = (coord.y / 100) * H;
          const radius = 4 + r.vol * 0.4;
          const color = STATUS_COLOR[r.status];
          const isHovered = hovered === r.id;

          return (
            <g
              key={r.id}
              onMouseEnter={() => setHovered(r.id)}
              style={{ cursor: 'pointer' }}
            >
              {/* Glow */}
              <circle cx={cx} cy={cy} r={radius * 2.5} fill={`url(#glow-${r.id})`} />
              {/* Hover ring */}
              {isHovered && (
                <circle cx={cx} cy={cy} r={radius + 4} fill="none" stroke={color} strokeWidth="1" opacity="0.5" />
              )}
              {/* Node */}
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill={color}
                fillOpacity="0.2"
                stroke={color}
                strokeWidth="1.5"
              />
              {/* Region label */}
              <text
                x={cx}
                y={cy - radius - 6}
                textAnchor="middle"
                fontSize="9"
                fill="var(--steel)"
                style={{ fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none' }}
              >
                {coord.city}
              </text>
              {/* Latency label */}
              <text
                x={cx}
                y={cy + radius + 14}
                textAnchor="middle"
                fontSize="9"
                fill={color}
                style={{ fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none' }}
              >
                {r.lat}ms
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredRegion && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: 'var(--slate)',
          border: '1px solid var(--line-2)',
          borderRadius: 4,
          padding: '8px 12px',
          fontSize: 11,
          pointerEvents: 'none',
          zIndex: 10,
          minWidth: 140,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
            {hoveredRegion.city}
          </div>
          <div style={{ color: 'var(--steel)', marginBottom: 6, fontSize: 10 }}>
            {hoveredRegion.id}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
            <span style={{ color: 'var(--fog)' }}>Latency</span>
            <span style={{ color: STATUS_COLOR[hoveredRegion.status] }}>{hoveredRegion.lat}ms</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'var(--fog)' }}>Traffic</span>
            <span style={{ color: 'var(--fg)' }}>{hoveredRegion.vol}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
