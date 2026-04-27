// Rolls up llm_events older than 7 days into llm_daily_rollups.
// Runs daily — skips if today's rollup already completed.
// This is the observatory's self-archive: permanent compressed record
// that survives even if raw events are pruned.

import { db } from '@/server/db';
import { Prisma } from '@prisma/client';

export async function runDailyRollup(): Promise<{ rolledUp: number; alreadyDone: boolean }> {
  const today = new Date().toISOString().split('T')[0]!;

  // Check if we already ran a rollup today
  const existing = await db.archiveRun.findFirst({
    where: {
      startedAt: { gte: new Date(today) },
      status:    'done',
    },
    select: { id: true },
  });
  if (existing) return { rolledUp: 0, alreadyDone: true };

  const runId = crypto.randomUUID();
  await db.$executeRaw`
    INSERT INTO archive_runs (id, started_at, status, cutoff_days, rows_rolled_up, rows_deleted, rollup_days_span)
    VALUES (${runId}::uuid, NOW(), 'running', 7, 0, 0, 0)
  `;

  let rowsRolledUp = 0;
  let rollupDaysSpan = 0;
  let error: string | null = null;

  try {
    const result = await db.$queryRaw<Array<{ rolled: bigint }>>`
      WITH upserted AS (
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
          calls                = EXCLUDED.calls,
          cost_usd             = EXCLUDED.cost_usd,
          input_tokens         = EXCLUDED.input_tokens,
          output_tokens        = EXCLUDED.output_tokens,
          cached_tokens        = EXCLUDED.cached_tokens,
          cache_creation_tokens= EXCLUDED.cache_creation_tokens,
          reasoning_tokens     = EXCLUDED.reasoning_tokens,
          error_count          = EXCLUDED.error_count,
          avg_latency_ms       = EXCLUDED.avg_latency_ms,
          archived_raw_count   = EXCLUDED.archived_raw_count
        RETURNING 1
      )
      SELECT COUNT(*)::bigint AS rolled FROM upserted
    `;

    rowsRolledUp = Number(result[0]?.rolled ?? 0);

    const span = await db.$queryRaw<Array<{ days: bigint }>>`
      SELECT COUNT(DISTINCT DATE_TRUNC('day', ts))::bigint AS days
      FROM llm_events WHERE ts < NOW() - INTERVAL '7 days'
    `;
    rollupDaysSpan = Number(span[0]?.days ?? 0);

  } catch (e) {
    error = String(e);
  }

  await db.$executeRaw`
    UPDATE archive_runs
    SET status           = ${error ? 'error' : 'done'},
        finished_at      = NOW(),
        rows_rolled_up   = ${rowsRolledUp},
        rollup_days_span = ${rollupDaysSpan},
        error_message    = ${error ?? Prisma.sql`NULL`}
    WHERE id = ${runId}::uuid
  `;

  return { rolledUp: rowsRolledUp, alreadyDone: false };
}
