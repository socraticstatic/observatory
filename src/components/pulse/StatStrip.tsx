'use client';

interface Stat {
  label: string;
  value: string;
  delta: string;
  col: string;
}

const STATS: Stat[] = [
  { label: 'Total Calls',      value: '14,284', delta: '+284',  col: 'var(--mist)'     },
  { label: 'Cache Hit',        value: '43.8%',  delta: '+2.1%', col: 'var(--accent-2)' },
  { label: 'Avg Quality',      value: '94.2',   delta: '-0.3',  col: 'var(--good)'     },
  { label: 'Error Rate',       value: '0.4%',   delta: '+0.1%', col: 'var(--warn)'     },
  { label: 'Active Sessions',  value: '3',      delta: '',      col: 'var(--mist)'     },
  { label: 'Zombie Risk',      value: '2',      delta: 'WARN',  col: 'var(--bad)'      },
];

function deltaColor(delta: string, col: string): string {
  if (!delta) return 'var(--steel)';
  if (delta === 'WARN') return 'var(--bad)';
  if (delta.startsWith('+')) return col === 'var(--warn)' || col === 'var(--bad)' ? 'var(--bad)' : 'var(--good)';
  if (delta.startsWith('-')) return col === 'var(--good)' ? 'var(--warn)' : 'var(--good)';
  return 'var(--steel)';
}

export function StatStrip() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 8,
        marginBottom: 12,
      }}
    >
      {STATS.map((stat) => (
        <div
          key={stat.label}
          className="card"
          style={{ padding: '12px 14px' }}
        >
          <div className="label" style={{ marginBottom: 6 }}>{stat.label}</div>

          <div
            className="mono"
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: stat.col,
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {stat.value}
          </div>

          {stat.delta ? (
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: deltaColor(stat.delta, stat.col),
                fontWeight: stat.delta === 'WARN' ? 600 : 400,
                letterSpacing: stat.delta === 'WARN' ? '.1em' : 'normal',
              }}
            >
              {stat.delta}
            </div>
          ) : (
            <div style={{ height: 14 }} />
          )}
        </div>
      ))}
    </div>
  );
}
