// src/app/api/sync/route.ts
//
// Proactive observability engine — runs every 15 min from the client.
// Pulls real usage from external provider APIs and upserts into llm_events.
// Runs daily self-archive rollup to compress history into llm_daily_rollups.

import { NextResponse } from 'next/server';
import { syncElevenLabs } from '@/lib/providers/elevenlabs-sync';
import { syncHeyGen }     from '@/lib/providers/heygen-sync';
import { syncLeonardo }   from '@/lib/providers/leonardo-sync';
import { runDailyRollup } from '@/lib/providers/daily-rollup';

export const dynamic = 'force-dynamic';

export async function POST() {
  const results: Record<string, unknown> = {};

  // Provider syncs — pull real usage history
  await Promise.allSettled([
    syncElevenLabs().then(r  => { results.elevenlabs = r; })
                    .catch(e => { results.elevenlabs = { error: String(e) }; }),
    syncHeyGen().then(r      => { results.heygen = r; })
                .catch(e     => { results.heygen = { error: String(e) }; }),
    syncLeonardo().then(r    => { results.leonardo = r; })
                  .catch(e  => { results.leonardo = { error: String(e) }; }),
  ]);

  // Self-archive — roll up events older than 7 days into daily rollups
  try {
    results.rollup = await runDailyRollup();
  } catch (e) {
    results.rollup = { error: String(e) };
  }

  return NextResponse.json({ ok: true, results, ts: new Date().toISOString() });
}
