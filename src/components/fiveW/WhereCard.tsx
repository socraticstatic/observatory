'use client';

import { useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { trpc } from '@/lib/trpc-client';
import type { Lookback } from '@/lib/lookback';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Real lat/lng for AWS regions
const REGION_META: Record<string, { city: string; lat: number; lng: number }> = {
  'us-east-1':      { city: 'Virginia',     lat:  38.13, lng:  -78.45 },
  'us-east-2':      { city: 'Ohio',         lat:  40.00, lng:  -83.00 },
  'us-west-1':      { city: 'N. California',lat:  37.78, lng: -122.41 },
  'us-west-2':      { city: 'Oregon',       lat:  45.52, lng: -122.68 },
  'ca-central-1':   { city: 'Montreal',     lat:  45.42, lng:  -75.70 },
  'ca-west-1':      { city: 'Calgary',      lat:  51.05, lng: -114.07 },
  'eu-west-1':      { city: 'Ireland',      lat:  53.35, lng:   -6.26 },
  'eu-west-2':      { city: 'London',       lat:  51.51, lng:   -0.12 },
  'eu-west-3':      { city: 'Paris',        lat:  48.86, lng:    2.35 },
  'eu-central-1':   { city: 'Frankfurt',    lat:  50.11, lng:    8.68 },
  'eu-central-2':   { city: 'Zurich',       lat:  47.38, lng:    8.54 },
  'eu-north-1':     { city: 'Stockholm',    lat:  59.33, lng:   18.07 },
  'eu-south-1':     { city: 'Milan',        lat:  45.46, lng:    9.19 },
  'eu-south-2':     { city: 'Spain',        lat:  40.42, lng:   -3.70 },
  'il-central-1':   { city: 'Tel Aviv',     lat:  31.77, lng:   35.22 },
  'me-south-1':     { city: 'Bahrain',      lat:  26.23, lng:   50.59 },
  'me-central-1':   { city: 'Dubai',        lat:  25.20, lng:   55.27 },
  'af-south-1':     { city: 'Cape Town',    lat: -33.93, lng:   18.42 },
  'ap-south-1':     { city: 'Mumbai',       lat:  19.08, lng:   72.88 },
  'ap-south-2':     { city: 'Hyderabad',    lat:  17.39, lng:   78.49 },
  'ap-southeast-1': { city: 'Singapore',    lat:   1.35, lng:  103.82 },
  'ap-southeast-2': { city: 'Sydney',       lat: -33.87, lng:  151.21 },
  'ap-southeast-3': { city: 'Jakarta',      lat:  -6.21, lng:  106.85 },
  'ap-southeast-4': { city: 'Melbourne',    lat: -37.81, lng:  144.96 },
  'ap-northeast-1': { city: 'Tokyo',        lat:  35.68, lng:  139.69 },
  'ap-northeast-2': { city: 'Seoul',        lat:  37.56, lng:  126.98 },
  'ap-northeast-3': { city: 'Osaka',        lat:  34.69, lng:  135.50 },
  'ap-east-1':      { city: 'Hong Kong',    lat:  22.28, lng:  114.17 },
  'sa-east-1':      { city: 'São Paulo',    lat: -23.55, lng:  -46.63 },
};

type Status = 'ok' | 'warn' | 'bad';
const STATUS_COL: Record<Status, string> = { ok: '#7CA893', warn: '#C9966B', bad: '#B86B6B' };

function latencyToStatus(ms: number): Status {
  if (ms < 300) return 'ok';
  if (ms < 600) return 'warn';
  return 'bad';
}

interface RegionRow {
  region: string;
  calls: number;
  cost: number;
  avgLatMs: number;
}

interface TooltipState { x: number; y: number; region: string; city: string; status: Status; lat: number; vol: number }

interface Props {
  lookback?: Lookback;
  provider?: string;
}

export function WhereCard({ lookback = '24H', provider }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const { data: raw } = trpc.where.regional.useQuery({ lookback, provider });

  const rows: (RegionRow & { meta: { city: string; lat: number; lng: number }; vol: number; status: Status })[] = (() => {
    if (!raw || raw.length === 0) return [];
    const totalCalls = raw.reduce((s, r) => s + r.calls, 0) || 1;
    return raw.map(r => {
      const meta = REGION_META[r.region] ?? { city: r.region, lat: 0, lng: 0 };
      return {
        ...r,
        meta,
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

      <div style={{ position: 'relative' }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 120, center: [15, 20] }}
          style={{ width: '100%', height: 'auto' }}
        >
          <ZoomableGroup>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="rgba(138,146,151,.10)"
                    stroke="rgba(200,206,209,.18)"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: 'none' },
                      hover:   { outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>

            {rows.map(r => {
              const nodeR = 4 + r.vol * 0.35;
              return (
                <Marker
                  key={r.region}
                  coordinates={[r.meta.lng, r.meta.lat]}
                  onMouseMove={e => setTooltip({ x: e.clientX, y: e.clientY, region: r.region, city: r.meta.city, status: r.status, lat: r.avgLatMs, vol: r.vol })}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* glow */}
                  <circle r={nodeR * 2.6} fill={STATUS_COL[r.status]} opacity={0.12} />
                  {/* dot */}
                  <circle
                    r={nodeR}
                    fill={STATUS_COL[r.status]}
                    opacity={0.85}
                    style={{ cursor: 'pointer' }}
                  />
                  {/* ring */}
                  <circle r={nodeR} fill="none" stroke={STATUS_COL[r.status]} strokeWidth={0.8} opacity={0.5} />
                  {r.vol >= 12 && (
                    <text
                      textAnchor="middle"
                      y={nodeR + 10}
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, fill: 'var(--fog)', pointerEvents: 'none' }}
                    >
                      {r.meta.city}
                    </text>
                  )}
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>

        {rows.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--steel)' }}>No regional data</span>
          </div>
        )}

        {tooltip && (
          <div className="tt" style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 80, zIndex: 9999 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COL[tooltip.status], display: 'inline-block' }} />
              <span style={{ fontWeight: 600, fontSize: 12 }}>{tooltip.city}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--steel)', marginBottom: 4 }}>{tooltip.region}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
              <span style={{ color: 'var(--fog)', fontSize: 11 }}>Avg latency</span>
              <span className="num" style={{ fontSize: 11 }}>{tooltip.lat}ms</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: 'var(--fog)', fontSize: 11 }}>Traffic share</span>
              <span className="num" style={{ fontSize: 11 }}>{tooltip.vol}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
