// src/app/api/sync/route.ts
// Triggered by the app on a schedule (every 15 min) to pull real usage
// from external provider APIs and upsert into llm_events.

import { NextResponse } from 'next/server';
import { syncElevenLabs } from '@/lib/providers/elevenlabs-sync';

export const dynamic = 'force-dynamic';

export async function POST() {
  const results: Record<string, unknown> = {};

  try {
    results.elevenlabs = await syncElevenLabs();
  } catch (e) {
    results.elevenlabs = { error: String(e) };
  }

  return NextResponse.json({ ok: true, results, ts: new Date().toISOString() });
}
