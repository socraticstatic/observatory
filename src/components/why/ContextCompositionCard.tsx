'use client';

const SEGMENTS = [
  { label: 'System Prompt', pct: 28, tokens: 35840, col: '#6FA8B3' },
  { label: 'Prior Turns',   pct: 35, tokens: 44800, col: '#9BC4CC' },
  { label: 'Tool Results',  pct: 22, tokens: 28160, col: '#C9966B' },
  { label: 'RAG Context',   pct: 15, tokens: 19200, col: '#4F7B83' },
];

const TOTAL_K = 128;
const CX = 80;
const CY = 80;
const R_OUTER = 68;
const R_INNER = 44;

function buildDonut(segments: typeof SEGMENTS) {
  const paths: { d: string; col: string }[] = [];
  let cumDeg = -90; // start at top

  for (const seg of segments) {
    const startDeg = cumDeg;
    const sweepDeg = (seg.pct / 100) * 360;
    cumDeg += sweepDeg;

    const toRad = (d: number) => (d * Math.PI) / 180;
    const startR = toRad(startDeg);
    const endR   = toRad(cumDeg);

    const x1o = CX + R_OUTER * Math.cos(startR);
    const y1o = CY + R_OUTER * Math.sin(startR);
    const x2o = CX + R_OUTER * Math.cos(endR);
    const y2o = CY + R_OUTER * Math.sin(endR);
    const x1i = CX + R_INNER * Math.cos(endR);
    const y1i = CY + R_INNER * Math.sin(endR);
    const x2i = CX + R_INNER * Math.cos(startR);
    const y2i = CY + R_INNER * Math.sin(startR);

    const large = sweepDeg > 180 ? 1 : 0;

    const d = [
      `M ${x1o.toFixed(2)} ${y1o.toFixed(2)}`,
      `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${x2o.toFixed(2)} ${y2o.toFixed(2)}`,
      `L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`,
      `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${x2i.toFixed(2)} ${y2i.toFixed(2)}`,
      'Z',
    ].join(' ');

    paths.push({ d, col: seg.col });
  }

  return paths;
}

function fmtK(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}

export function ContextCompositionCard() {
  const paths = buildDonut(SEGMENTS);

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="label" style={{ marginBottom: 14 }}>
        Context Composition · What fills the context window
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {/* Donut */}
        <div style={{ flexShrink: 0 }}>
          <svg width={160} height={160}>
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill={p.col} stroke="var(--ink-2)" strokeWidth="2" />
            ))}
            {/* center text */}
            <text
              x={CX} y={CY - 8}
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="18"
              fontWeight="600"
              fill="var(--mist)"
            >
              {TOTAL_K}K
            </text>
            <text
              x={CX} y={CY + 10}
              textAnchor="middle"
              fontFamily="'Space Grotesk', sans-serif"
              fontSize="9"
              letterSpacing="0.12em"
              fill="var(--steel)"
              style={{ textTransform: 'uppercase' }}
            >
              avg utilization
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SEGMENTS.map(seg => (
            <div key={seg.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fog)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.col, display: 'inline-block', flexShrink: 0 }} />
                  {seg.label}
                </span>
                <span style={{ display: 'flex', gap: 10 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>{fmtK(seg.tokens)}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--mist)', minWidth: 32, textAlign: 'right' }}>{seg.pct}%</span>
                </span>
              </div>
              <div style={{ height: 3, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${seg.pct}%`, background: seg.col, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div style={{
        marginTop: 14,
        padding: '10px 12px',
        background: 'rgba(201,150,107,.07)',
        border: '1px solid rgba(201,150,107,.2)',
        borderRadius: 'var(--r)',
        fontSize: 11,
        color: 'var(--warn)',
        lineHeight: 1.5,
      }}>
        <span style={{ fontWeight: 600 }}>Recommendation: </span>
        Prior turn accumulation is above threshold. Consider summarization after turn 8.
      </div>
    </div>
  );
}
