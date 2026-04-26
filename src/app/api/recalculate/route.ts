// Admin endpoint: recalculate costUsd for all historical LLM events using
// the canonical pricing engine, then re-run the daily rollup UPSERT to fix
// llm_daily_rollups.cost_usd with the corrected sums.
//
// POST /api/recalculate  — runs the full backfill (idempotent)
// Only accessible from localhost — guarded by RECALC_SECRET env var.

import { NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.RECALC_SECRET;
  if (secret) {
    const auth = req.headers.get('x-recalc-secret');
    if (auth !== secret) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Step 1: Recalculate costUsd on all LLM events using model-aware pricing.
  // Uses the same rates as src/lib/pricing.ts — keeps them in sync manually.
  // Order matters: more-specific ILIKE patterns must come before generic ones.
  const updated = await db.$executeRaw`
    UPDATE llm_events
    SET "costUsd" = GREATEST(0, CASE
      -- ── Anthropic ────────────────────────────────────────────────────
      WHEN model ILIKE '%claude-opus%' THEN
        "inputTokens"::numeric         * 0.000015   +
        "cacheCreationTokens"::numeric * 0.000015   * 1.25 +
        "cachedTokens"::numeric        * 0.000015   * 0.10 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.000075

      WHEN model ILIKE '%claude-sonnet%' THEN
        "inputTokens"::numeric         * 0.000003   +
        "cacheCreationTokens"::numeric * 0.000003   * 1.25 +
        "cachedTokens"::numeric        * 0.000003   * 0.10 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.000015

      WHEN model ILIKE '%claude-haiku%' THEN
        "inputTokens"::numeric         * 0.0000008  +
        "cacheCreationTokens"::numeric * 0.0000008  * 1.25 +
        "cachedTokens"::numeric        * 0.0000008  * 0.10 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.000004

      -- ── OpenAI ────────────────────────────────────────────────────────
      WHEN model ILIKE '%gpt-4o-mini%' THEN
        "inputTokens"::numeric         * 0.00000015 +
        "cachedTokens"::numeric        * 0.00000015 * 0.50 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.0000006

      WHEN model ILIKE '%gpt-4o%' THEN
        "inputTokens"::numeric         * 0.0000025  +
        "cachedTokens"::numeric        * 0.0000025  * 0.50 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.00001

      WHEN model ILIKE '%gpt-4-turbo%' THEN
        "inputTokens"::numeric         * 0.00001    +
        ("outputTokens" + "reasoningTokens")::numeric * 0.00003

      WHEN model ILIKE '%gpt-4%' THEN
        "inputTokens"::numeric         * 0.00003    +
        ("outputTokens" + "reasoningTokens")::numeric * 0.00006

      WHEN model ILIKE '%o3-mini%' OR model ILIKE '%o1-mini%' THEN
        "inputTokens"::numeric         * 0.0000011  +
        "cachedTokens"::numeric        * 0.0000011  * 0.50 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.0000044

      WHEN model ILIKE '%o3%' THEN
        "inputTokens"::numeric         * 0.00001    +
        "cachedTokens"::numeric        * 0.00001    * 0.50 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.00004

      WHEN model ILIKE '%o1%' THEN
        "inputTokens"::numeric         * 0.000015   +
        "cachedTokens"::numeric        * 0.000015   * 0.50 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.00006

      -- ── Google Gemini ─────────────────────────────────────────────────
      WHEN model ILIKE '%gemini-2.5-pro%' THEN
        "inputTokens"::numeric         * 0.00000125 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.00001

      WHEN model ILIKE '%gemini-2.5-flash%' THEN
        "inputTokens"::numeric         * 0.00000015 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.0000006

      WHEN model ILIKE '%gemini-2.0-flash%' THEN
        "inputTokens"::numeric         * 0.0000001  +
        ("outputTokens" + "reasoningTokens")::numeric * 0.0000004

      WHEN model ILIKE '%gemini-1.5-pro%' THEN
        "inputTokens"::numeric         * 0.00000125 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.000005

      WHEN model ILIKE '%gemini-1.5-flash%' THEN
        "inputTokens"::numeric         * 0.000000075 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.0000003

      WHEN model ILIKE '%gemini%' THEN
        "inputTokens"::numeric         * 0.00000125 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.000005

      -- ── xAI / Grok ────────────────────────────────────────────────────
      WHEN model ILIKE '%grok-3-mini%' THEN
        "inputTokens"::numeric         * 0.0000003  +
        ("outputTokens" + "reasoningTokens")::numeric * 0.0000005

      WHEN model ILIKE '%grok-3%' OR model ILIKE '%grok%' THEN
        "inputTokens"::numeric         * 0.000003   +
        ("outputTokens" + "reasoningTokens")::numeric * 0.000015

      -- ── Meta / Llama ──────────────────────────────────────────────────
      WHEN model ILIKE '%llama-3.1-405b%' THEN
        "inputTokens"::numeric         * 0.000003   +
        ("outputTokens" + "reasoningTokens")::numeric * 0.000003

      WHEN model ILIKE '%llama-3.1-70b%' OR model ILIKE '%llama%' THEN
        "inputTokens"::numeric         * 0.00000059 +
        ("outputTokens" + "reasoningTokens")::numeric * 0.00000079

      -- ── Default ───────────────────────────────────────────────────────
      ELSE
        "inputTokens"::numeric         * 0.000003   +
        ("outputTokens" + "reasoningTokens")::numeric * 0.000015
    END)
    WHERE "contentType" IS NULL OR "contentType" NOT IN ('tts', 'video', 'image')
  `;

  // Step 1b: Recalculate creative service costs separately (ElevenLabs + HeyGen).
  await db.$executeRaw`
    UPDATE llm_events
    SET "costUsd" = CASE
      WHEN provider = 'heygen'     THEN GREATEST(0.000001, "inputTokens"::numeric * 0.0000667)
      WHEN provider = 'elevenlabs' THEN GREATEST(0.000001, "inputTokens"::numeric * 0.00000033)
      WHEN provider = 'leonardo'   THEN "costUsd"
      ELSE "costUsd"
    END
    WHERE "contentType" IN ('tts', 'video', 'image')
  `;

  // Step 2: Re-run the rollup UPSERT to fix llm_daily_rollups with corrected costs.
  const rollupFixed = await db.$executeRaw`
    INSERT INTO llm_daily_rollups
      (id, day, provider, model, project, surface,
       calls, cost_usd, input_tokens, output_tokens,
       cached_tokens, cache_creation_tokens, reasoning_tokens,
       error_count, avg_latency_ms, archived_raw_count, created_at)
    SELECT
      gen_random_uuid(),
      DATE_TRUNC('day', ts)::date,
      provider,
      model,
      COALESCE(project,  ''),
      COALESCE(surface,  ''),
      COUNT(*)::int,
      SUM("costUsd"),
      SUM("inputTokens")::bigint,
      SUM("outputTokens")::bigint,
      SUM("cachedTokens")::bigint,
      SUM("cacheCreationTokens")::bigint,
      SUM("reasoningTokens")::bigint,
      COUNT(*) FILTER (WHERE status = 'error')::int,
      AVG("latencyMs"),
      COUNT(*)::int,
      NOW()
    FROM llm_events
    WHERE ts < NOW() - INTERVAL '7 days'
    GROUP BY
      DATE_TRUNC('day', ts)::date,
      provider, model,
      COALESCE(project, ''),
      COALESCE(surface, '')
    ON CONFLICT (day, provider, model,
                 COALESCE(project, ''), COALESCE(surface, ''))
    DO UPDATE SET
      cost_usd             = EXCLUDED.cost_usd,
      calls                = EXCLUDED.calls,
      input_tokens         = EXCLUDED.input_tokens,
      output_tokens        = EXCLUDED.output_tokens,
      cached_tokens        = EXCLUDED.cached_tokens,
      cache_creation_tokens= EXCLUDED.cache_creation_tokens,
      reasoning_tokens     = EXCLUDED.reasoning_tokens,
      error_count          = EXCLUDED.error_count,
      avg_latency_ms       = EXCLUDED.avg_latency_ms,
      archived_raw_count   = EXCLUDED.archived_raw_count
  `;

  return NextResponse.json({
    ok: true,
    updatedEvents: updated,
    fixedRollupRows: rollupFixed,
    ts: new Date().toISOString(),
  });
}
