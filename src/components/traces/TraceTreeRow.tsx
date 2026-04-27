'use client';

import { useState } from 'react';
import { fmtMs, fmtUsd } from '@/lib/fmt';

export interface TraceNode {
  id: string;
  ts: string;
  provider: string;
  model: string;
  spanId: string | null;
  parentSpanId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  latencyMs: number | null;
  status: string;
  surface: string | null;
  project: string | null;
  sessionId: string | null;
  children: TraceNode[];
}

interface Props {
  node: TraceNode;
  depth?: number;
  maxLatMs?: number;
}

export function TraceTreeRow({ node, depth = 0, maxLatMs = 1 }: Props) {
  const [open, setOpen] = useState(depth === 0 && node.children.length > 0);

  const isError = node.status === 'error';
  const hasKids = node.children.length > 0;
  const barWidth = node.latencyMs ? Math.max(2, (node.latencyMs / Math.max(maxLatMs, 1)) * 80) : 0;
  const indent = depth * 18;

  return (
    <>
      <tr
        onClick={() => hasKids && setOpen(o => !o)}
        style={{
          cursor: hasKids ? 'pointer' : 'default',
          borderBottom: '1px solid var(--line-2)',
          background: depth % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
        }}
      >
        {/* Model + project */}
        <td style={{ paddingLeft: 12 + indent, paddingTop: 6, paddingBottom: 6, width: '30%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {hasKids ? (
              <span className="mono" style={{ fontSize: 9, color: 'var(--steel)', width: 10 }}>
                {open ? '▼' : '▶'}
              </span>
            ) : (
              <span style={{ display: 'inline-block', width: 10 }} />
            )}
            <span className="mono" style={{ fontSize: 11, color: isError ? 'var(--bad)' : 'var(--fog)' }}>
              {node.model.split('/').pop()}
            </span>
            {node.project && (
              <span className="mono" style={{ fontSize: 9, color: 'var(--steel)' }}>
                {node.project}
              </span>
            )}
          </div>
        </td>

        {/* Latency bar */}
        <td style={{ paddingTop: 6, paddingBottom: 6, width: '25%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: `${barWidth}%`, height: 4, borderRadius: 2,
              background: isError ? 'var(--bad)' : depth === 0 ? '#6FA8B3' : '#4A6B73',
              minWidth: 2,
            }} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>
              {node.latencyMs ? fmtMs(node.latencyMs) : '—'}
            </span>
          </div>
        </td>

        {/* Tokens */}
        <td style={{ paddingTop: 6, paddingBottom: 6, width: '25%' }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--graphite)' }}>
            {(node.inputTokens + node.outputTokens).toLocaleString()}
            {node.cachedTokens > 0 && (
              <span style={{ color: 'var(--accent-2)' }}> · {node.cachedTokens.toLocaleString()} cached</span>
            )}
          </span>
        </td>

        {/* Cost */}
        <td style={{ paddingTop: 6, paddingBottom: 6, textAlign: 'right', paddingRight: 12 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
            {fmtUsd(node.costUsd)}
          </span>
        </td>
      </tr>

      {open && node.children.map(child => (
        <TraceTreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          maxLatMs={maxLatMs}
        />
      ))}
    </>
  );
}
