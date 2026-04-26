// src/app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { parseIngestPayload } from '@/lib/ingest';

export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secret = req.headers.get('x-litellm-signature') ?? req.headers.get('authorization');
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

  const event = parseIngestPayload(body);
  if (!event) {
    return NextResponse.json({ error: 'Unparseable payload' }, { status: 422 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.llmEvent.create({ data: event as any });
  } catch (err: unknown) {
    // P2002 = unique constraint violation — duplicate event fired by multi-process LiteLLM
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
