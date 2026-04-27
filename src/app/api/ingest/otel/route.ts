// src/app/api/ingest/otel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { parseOtelPayload } from '@/lib/otel-ingest';
import { calcCost } from '@/lib/pricing';

export async function POST(req: NextRequest) {
  // Optional auth — same secret as LiteLLM webhook
  const secret   = req.headers.get('x-otel-secret') ?? req.headers.get('authorization');
  const expected = process.env.LITELLM_CALLBACK_SECRET;
  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = parseOtelPayload(body);
  if (events.length === 0) {
    return NextResponse.json({ error: 'No parseable spans found' }, { status: 422 });
  }

  let created = 0;
  let duplicates = 0;

  for (const event of events) {
    // Apply cost fallback — OTel spans don't carry response_cost
    if (!event.costUsd || event.costUsd === '0') {
      event.costUsd = calcCost({
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        reasoningTokens: event.reasoningTokens ?? 0,
        cachedTokens: event.cachedTokens ?? 0,
        cacheCreationTokens: event.cacheCreationTokens ?? 0,
      });
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.llmEvent.create({ data: event as any });
      created++;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        duplicates++;
      } else {
        throw err;
      }
    }
  }

  return NextResponse.json({ ok: true, created, duplicates });
}
