import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

function esc(v: string | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS = ['ts', 'provider', 'model', 'project', 'surface', 'content_type', 'status',
  'input_tokens', 'output_tokens', 'cached_tokens', 'reasoning_tokens',
  'cost_usd', 'latency_ms', 'session_id', 'region'];

export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams;
  const lookback = params.get('lookback') ?? '30D';
  const provider = params.get('provider');

  const msMap: Record<string, number> = {
    '1H': 3_600_000, '24H': 86_400_000,
    '30D': 30 * 86_400_000, '90D': 90 * 86_400_000, '1Y': 365 * 86_400_000,
  };
  const since = new Date(Date.now() - (msMap[lookback] ?? msMap['30D']));

  const events = await db.llmEvent.findMany({
    where: {
      ts: { gte: since },
      ...(provider ? { provider } : {}),
    },
    orderBy: { ts: 'desc' },
    take: 10_000,
    select: {
      ts: true, provider: true, model: true, project: true, surface: true,
      contentType: true, status: true,
      inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true,
      costUsd: true, latencyMs: true, sessionId: true, region: true,
    },
  });

  const rows = events.map(e => [
    e.ts.toISOString(), e.provider, e.model, e.project, e.surface, e.contentType,
    e.status, e.inputTokens, e.outputTokens, e.cachedTokens, e.reasoningTokens,
    Number(e.costUsd).toFixed(6), e.latencyMs ?? '', e.sessionId, e.region,
  ].map(v => esc(v == null ? '' : String(v))).join(','));

  const csv = [HEADERS.join(','), ...rows].join('\n');
  const filename = `observatory-traces-${lookback}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
